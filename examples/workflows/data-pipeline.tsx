// Data Pipeline Workflow
// Demonstrates: ETL (Extract, Transform, Load) data processing pipeline
//
// This workflow shows:
// - Sequential data processing stages (fetch → validate → transform → load)
// - Reading from multiple data sources (APIs, files, databases)
// - Error handling and retry logic for network operations
// - Data validation and cleaning patterns
// - Progress tracking via supervisor state
// - Writing results to multiple destinations

import { smithers, Workflow, Task, Sequence, ClaudeCodeAgent } from "smithers-orchestrator";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Schema - Data pipeline stages
// ---------------------------------------------------------------------------

const inputTable = sqliteTable("input", {
  runId: text("run_id").primaryKey(),
  sourceApiUrl: text("source_api_url").notNull(), // API endpoint to fetch from
  sourceCsvPath: text("source_csv_path"), // Optional CSV file path
  outputDbPath: text("output_db_path").notNull(), // Where to write results
});

const extractTable = sqliteTable(
  "extract",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    recordsFetched: integer("records_fetched").notNull(),
    sources: text("sources", { mode: "json" }).$type<Array<{
      name: string;
      type: string;
      recordCount: number;
    }>>(),
    errors: text("errors", { mode: "json" }).$type<string[]>(),
    summary: text("summary").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

const validateTable = sqliteTable(
  "validate",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    recordsValid: integer("records_valid").notNull(),
    recordsInvalid: integer("records_invalid").notNull(),
    validationErrors: text("validation_errors", { mode: "json" }).$type<Array<{
      record: string;
      field: string;
      error: string;
    }>>(),
    cleanedData: text("cleaned_data", { mode: "json" }).$type<any[]>(),
    summary: text("summary").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

const transformTable = sqliteTable(
  "transform",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    transformationsApplied: text("transformations_applied", { mode: "json" }).$type<string[]>(),
    recordsTransformed: integer("records_transformed").notNull(),
    aggregations: text("aggregations", { mode: "json" }).$type<Record<string, any>>(),
    transformedData: text("transformed_data", { mode: "json" }).$type<any[]>(),
    summary: text("summary").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

const loadTable = sqliteTable(
  "load",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    recordsWritten: integer("records_written").notNull(),
    destinations: text("destinations", { mode: "json" }).$type<Array<{
      type: string;
      path: string;
      recordCount: number;
    }>>(),
    success: integer("success", { mode: "boolean" }).notNull(),
    summary: text("summary").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

const reportTable = sqliteTable(
  "report",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    totalRecordsProcessed: integer("total_records_processed").notNull(),
    successRate: integer("success_rate").notNull(), // percentage
    executionTimeMs: integer("execution_time_ms").notNull(),
    reportPath: text("report_path").notNull(),
    summary: text("summary").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

const outputTable = sqliteTable(
  "output",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    status: text("status").notNull(),
    recordsProcessed: integer("records_processed").notNull(),
    errorCount: integer("error_count").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

export const schema = {
  input: inputTable,
  extract: extractTable,
  validate: validateTable,
  transform: transformTable,
  load: loadTable,
  report: reportTable,
  output: outputTable,
};

export const db = drizzle(".smithers/data-pipeline.db", { schema });

// Create tables
(db as any).$client.exec(`
  CREATE TABLE IF NOT EXISTS input (
    run_id TEXT PRIMARY KEY,
    source_api_url TEXT NOT NULL,
    source_csv_path TEXT,
    output_db_path TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS extract (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    records_fetched INTEGER NOT NULL,
    sources TEXT, errors TEXT, summary TEXT NOT NULL,
    PRIMARY KEY (run_id, node_id)
  );
  CREATE TABLE IF NOT EXISTS validate (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    records_valid INTEGER NOT NULL, records_invalid INTEGER NOT NULL,
    validation_errors TEXT, cleaned_data TEXT, summary TEXT NOT NULL,
    PRIMARY KEY (run_id, node_id)
  );
  CREATE TABLE IF NOT EXISTS transform (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    transformations_applied TEXT, records_transformed INTEGER NOT NULL,
    aggregations TEXT, transformed_data TEXT, summary TEXT NOT NULL,
    PRIMARY KEY (run_id, node_id)
  );
  CREATE TABLE IF NOT EXISTS load (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    records_written INTEGER NOT NULL,
    destinations TEXT, success INTEGER NOT NULL, summary TEXT NOT NULL,
    PRIMARY KEY (run_id, node_id)
  );
  CREATE TABLE IF NOT EXISTS report (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    total_records_processed INTEGER NOT NULL,
    success_rate INTEGER NOT NULL, execution_time_ms INTEGER NOT NULL,
    report_path TEXT NOT NULL, summary TEXT NOT NULL,
    PRIMARY KEY (run_id, node_id)
  );
  CREATE TABLE IF NOT EXISTS output (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    status TEXT NOT NULL, records_processed INTEGER NOT NULL,
    error_count INTEGER NOT NULL,
    PRIMARY KEY (run_id, node_id)
  );
  CREATE TABLE IF NOT EXISTS state (
    key TEXT PRIMARY KEY, value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// ---------------------------------------------------------------------------
// Supervisor state management
// ---------------------------------------------------------------------------

function updateState(key: string, value: string) {
  try {
    (db as any).$client.run(
      "INSERT OR REPLACE INTO state (key, value, updated_at) VALUES (?, ?, datetime('now'))",
      [key, value]
    );
  } catch (err) {
    console.error(`Failed to update state ${key}:`, err);
  }
}

updateState("supervisor.status", "running");
updateState("supervisor.summary", "Data pipeline workflow initialized");
updateState("supervisor.heartbeat", new Date().toISOString());

// Update heartbeat every 30 seconds
setInterval(() => {
  try {
    updateState("supervisor.heartbeat", new Date().toISOString());
  } catch (err) {
    console.error("Heartbeat failed:", err);
  }
}, 30000);

// ---------------------------------------------------------------------------
// Agents - Each stage has specialized agent with appropriate model
// ---------------------------------------------------------------------------

const cliEnv = { ANTHROPIC_API_KEY: "" };

// Extract agent - Uses Haiku for fast, simple data fetching
const extractAgent = new ClaudeCodeAgent({
  model: "haiku",
  env: cliEnv,
  systemPrompt: "You are a data engineer. Fetch data from the specified sources (API, CSV files, etc.). " +
    "Handle network errors gracefully with retries. " +
    "Respond with ONLY a JSON object: " +
    '{ "recordsFetched": 1234, "sources": [{"name": "api", "type": "rest", "recordCount": 1000}], ' +
    '"errors": ["error1"], "summary": "Fetched 1234 records from 2 sources" }',
});

// Validate agent - Uses Sonnet for complex validation logic
const validateAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a data quality engineer. Validate and clean the extracted data. " +
    "Check for: missing fields, invalid formats, duplicates, outliers. " +
    "Remove or fix invalid records. " +
    "Respond with ONLY a JSON object: " +
    '{ "recordsValid": 1200, "recordsInvalid": 34, ' +
    '"validationErrors": [{"record": "id123", "field": "email", "error": "invalid format"}], ' +
    '"cleanedData": [{...}], "summary": "Validated 1234 records, 34 errors found and fixed" }',
});

// Transform agent - Uses Sonnet for complex data transformations
const transformAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a data engineer. Transform and aggregate the validated data. " +
    "Apply business logic: join datasets, calculate derived fields, aggregate by groups. " +
    "Respond with ONLY a JSON object: " +
    '{ "transformationsApplied": ["join_users", "calculate_totals", "group_by_date"], ' +
    '"recordsTransformed": 1200, "aggregations": {"total_revenue": 50000}, ' +
    '"transformedData": [{...}], "summary": "Applied 3 transformations to 1200 records" }',
});

// Load agent - Uses Haiku for simple write operations
const loadAgent = new ClaudeCodeAgent({
  model: "haiku",
  env: cliEnv,
  systemPrompt: "You are a data engineer. Write the transformed data to destinations. " +
    "Support: SQLite database, CSV files, JSON files. Handle write errors. " +
    "Respond with ONLY a JSON object: " +
    '{ "recordsWritten": 1200, ' +
    '"destinations": [{"type": "sqlite", "path": "output.db", "recordCount": 1200}], ' +
    '"success": true, "summary": "Wrote 1200 records to database" }',
});

// Report agent - Uses Haiku for simple reporting
const reportAgent = new ClaudeCodeAgent({
  model: "haiku",
  env: cliEnv,
  systemPrompt: "You are a data engineer. Generate a summary report of the pipeline execution. " +
    "Include: total records processed, success rate, execution time, errors. " +
    "Write report to a markdown file. " +
    "Respond with ONLY a JSON object: " +
    '{ "totalRecordsProcessed": 1200, "successRate": 97, "executionTimeMs": 45000, ' +
    '"reportPath": "pipeline-report.md", "summary": "Pipeline completed with 97% success rate" }',
});

// ---------------------------------------------------------------------------
// Workflow - Sequential ETL pipeline
// ---------------------------------------------------------------------------

export default smithers(db, (ctx) => {
  const startTime = Date.now();

  // Read outputs from previous stages
  const extract = ctx.outputs.extract?.[0];
  const validate = ctx.outputs.validate?.[0];
  const transform = ctx.outputs.transform?.[0];
  const load = ctx.outputs.load?.[0];
  const report = ctx.outputs.report?.[0];

  // Calculate progress metrics
  const recordsFetched = extract?.recordsFetched ?? 0;
  const recordsValid = validate?.recordsValid ?? 0;
  const recordsTransformed = transform?.recordsTransformed ?? 0;
  const recordsWritten = load?.recordsWritten ?? 0;

  // Update supervisor state with progress
  const currentStage = !extract ? "extracting" :
                      !validate ? "validating" :
                      !transform ? "transforming" :
                      !load ? "loading" :
                      !report ? "reporting" : "complete";

  updateState("supervisor.status", "running");
  updateState(
    "supervisor.summary",
    `Data Pipeline [${currentStage}]: ${recordsWritten}/${recordsFetched} records processed`
  );

  return (
    <Workflow name="data-pipeline">
      <Sequence>
        {/* STAGE 1: Extract data from sources */}
        <Task
          id="extract"
          output={schema.extract}
          agent={extractAgent}
          skipIf={!!extract}
          retries={3} // Retry on network failures
        >
          {`Extract data from these sources:\n` +
            `- API: ${ctx.input.sourceApiUrl ?? "https://api.example.com/data"}\n` +
            (ctx.input.sourceCsvPath ? `- CSV: ${ctx.input.sourceCsvPath}\n` : "") +
            `Fetch all available records. Handle rate limits and network errors with exponential backoff. ` +
            `Save raw data to .smithers/raw-data.json for debugging.`}
        </Task>

        {/* STAGE 2: Validate and clean data */}
        <Task
          id="validate"
          output={schema.validate}
          agent={validateAgent}
          skipIf={!!validate}
          retries={2}
        >
          {`Validate the ${extract?.recordsFetched ?? 0} records extracted from sources. ` +
            `Check for:\n` +
            `- Required fields: id, email, timestamp\n` +
            `- Valid email format\n` +
            `- No duplicates (by id)\n` +
            `- Timestamp within last 90 days\n` +
            `Remove or fix invalid records. Log all validation errors.`}
        </Task>

        {/* STAGE 3: Transform data */}
        <Task
          id="transform"
          output={schema.transform}
          agent={transformAgent}
          skipIf={!!transform}
          retries={2}
        >
          {`Transform the ${validate?.recordsValid ?? 0} valid records:\n` +
            `1. Normalize email addresses (lowercase)\n` +
            `2. Parse timestamps into date objects\n` +
            `3. Calculate derived fields: day_of_week, hour_of_day\n` +
            `4. Group by date and calculate daily aggregations:\n` +
            `   - total_count\n` +
            `   - unique_users\n` +
            `   - peak_hour\n` +
            `Save both detail and aggregated data.`}
        </Task>

        {/* STAGE 4: Load data to destinations */}
        <Task
          id="load"
          output={schema.load}
          agent={loadAgent}
          skipIf={!!load}
          retries={2}
        >
          {`Write the transformed data to:\n` +
            `1. SQLite database: ${ctx.input.outputDbPath ?? "output.db"}\n` +
            `   - Table: processed_data (detail records)\n` +
            `   - Table: daily_aggregations (aggregated data)\n` +
            `2. CSV file: output-summary.csv (aggregations only)\n` +
            `3. JSON file: output-full.json (full transformed dataset)\n` +
            `\n` +
            `Records to write: ${transform?.recordsTransformed ?? 0}\n` +
            `Ensure writes are atomic (use transactions). Verify record counts after writing.`}
        </Task>

        {/* STAGE 5: Generate report */}
        <Task
          id="report"
          output={schema.report}
          agent={reportAgent}
          skipIf={!!report}
          retries={1}
        >
          {`Generate pipeline execution report:\n` +
            `\n` +
            `Pipeline Summary:\n` +
            `- Records extracted: ${extract?.recordsFetched ?? 0}\n` +
            `- Records valid: ${validate?.recordsValid ?? 0}\n` +
            `- Records invalid: ${validate?.recordsInvalid ?? 0}\n` +
            `- Records transformed: ${transform?.recordsTransformed ?? 0}\n` +
            `- Records written: ${load?.recordsWritten ?? 0}\n` +
            `- Extraction errors: ${extract?.errors?.length ?? 0}\n` +
            `- Validation errors: ${validate?.validationErrors?.length ?? 0}\n` +
            `\n` +
            `Calculate success rate and execution time. ` +
            `Write detailed report to: pipeline-report-${new Date().toISOString().split('T')[0]}.md`}
        </Task>

        {/* FINAL: Output results */}
        <Task id="done" output={schema.output}>
          {{
            status: load?.success ? "success" : "failed",
            recordsProcessed: recordsWritten,
            errorCount: (extract?.errors?.length ?? 0) + (validate?.validationErrors?.length ?? 0),
          }}
        </Task>
      </Sequence>
    </Workflow>
  );
});

// ---------------------------------------------------------------------------
// Shutdown handlers
// ---------------------------------------------------------------------------

process.on("beforeExit", () => {
  try {
    const load = (db as any).select().from(schema.load).all();
    const success = load.length > 0 && load[0].success;
    const recordsWritten = load[0]?.recordsWritten ?? 0;

    updateState("supervisor.status", success ? "done" : "failed");
    updateState(
      "supervisor.summary",
      `Data pipeline ${success ? "completed" : "failed"}: ${recordsWritten} records processed`
    );
  } catch (err) {
    console.error("Failed to update final state:", err);
  }
});
