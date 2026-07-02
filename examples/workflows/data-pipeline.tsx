// Data Pipeline Workflow
// Demonstrates: ETL stages with progress surfaced through Takopi supervisor state.

import { createSmithers, ClaudeCodeAgent } from "smithers-orchestrator";
import { z } from "zod";

const inputSchema = z.object({
  sourceApiUrl: z.string().default("https://api.example.com/data"),
  sourceCsvPath: z.string().optional(),
  outputDbPath: z.string().default("output.db"),
});

const extractSchema = z.object({
  recordsFetched: z.number(),
  sources: z.array(z.object({
    name: z.string(),
    type: z.string(),
    recordCount: z.number(),
  })).default([]),
  errors: z.array(z.string()).default([]),
  summary: z.string(),
});

const validateSchema = z.object({
  recordsValid: z.number(),
  recordsInvalid: z.number(),
  validationErrors: z.array(z.object({
    record: z.string(),
    field: z.string(),
    error: z.string(),
  })).default([]),
  cleanedData: z.array(z.unknown()).default([]),
  summary: z.string(),
});

const transformSchema = z.object({
  transformationsApplied: z.array(z.string()).default([]),
  recordsTransformed: z.number(),
  aggregations: z.record(z.string(), z.unknown()).default({}),
  transformedData: z.array(z.unknown()).default([]),
  summary: z.string(),
});

const loadSchema = z.object({
  recordsWritten: z.number(),
  destinations: z.array(z.object({
    type: z.string(),
    path: z.string(),
    recordCount: z.number(),
  })).default([]),
  success: z.boolean(),
  summary: z.string(),
});

const reportSchema = z.object({
  totalRecordsProcessed: z.number(),
  successRate: z.number(),
  executionTimeMs: z.number(),
  reportPath: z.string(),
  summary: z.string(),
});

const outputSchema = z.object({
  status: z.string(),
  recordsProcessed: z.number(),
  errorCount: z.number(),
});

const { Workflow, Task, Sequence, smithers, outputs, db } = createSmithers(
  {
    input: inputSchema,
    extract: extractSchema,
    validate: validateSchema,
    transform: transformSchema,
    load: loadSchema,
    report: reportSchema,
    output: outputSchema,
  },
  { dbPath: ".smithers/data-pipeline.db" }
);

const sqlite = (db as any).$client as {
  exec: (sql: string) => unknown;
  run: (sql: string, params?: unknown[]) => unknown;
};

sqlite.exec([
  "CREATE TABLE IF NOT EXISTS state (",
  "  key TEXT PRIMARY KEY,",
  "  value TEXT NOT NULL,",
  "  updated_at TEXT DEFAULT (datetime('now'))",
  ")",
].join("\n"));

function updateState(key: string, value: string) {
  sqlite.run(
    "INSERT OR REPLACE INTO state (key, value, updated_at) VALUES (?, ?, datetime('now'))",
    [key, value]
  );
}

updateState("supervisor.status", "running");
updateState("supervisor.summary", "Data pipeline workflow initialized");
updateState("supervisor.heartbeat", new Date().toISOString());

const heartbeatTimer = setInterval(() => {
  updateState("supervisor.heartbeat", new Date().toISOString());
}, 30000);
heartbeatTimer.unref?.();

const cliEnv = { ANTHROPIC_API_KEY: "" };

const extractAgent = new ClaudeCodeAgent({
  model: "haiku",
  env: cliEnv,
  systemPrompt: "You are a data engineer. Fetch data from the configured sources and respond with only JSON matching the extract schema.",
});

const validateAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a data quality engineer. Validate and clean extracted data. Respond with only JSON matching the validate schema.",
});

const transformAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a data engineer. Transform and aggregate validated data. Respond with only JSON matching the transform schema.",
});

const loadAgent = new ClaudeCodeAgent({
  model: "haiku",
  env: cliEnv,
  systemPrompt: "You are a data engineer. Write transformed data to destinations. Respond with only JSON matching the load schema.",
});

const reportAgent = new ClaudeCodeAgent({
  model: "haiku",
  env: cliEnv,
  systemPrompt: "You are a data engineer. Generate a markdown execution report. Respond with only JSON matching the report schema.",
});

export default smithers((ctx) => {
  const startedAt = Date.now();
  const extract = ctx.outputs.extract?.[0];
  const validate = ctx.outputs.validate?.[0];
  const transform = ctx.outputs.transform?.[0];
  const load = ctx.outputs.load?.[0];
  const report = ctx.outputs.report?.[0];

  const recordsFetched = extract?.recordsFetched ?? 0;
  const recordsWritten = load?.recordsWritten ?? 0;
  const currentStage = !extract
    ? "extracting"
    : !validate
      ? "validating"
      : !transform
        ? "transforming"
        : !load
          ? "loading"
          : !report
            ? "reporting"
            : "complete";

  updateState("supervisor.status", "running");
  updateState("supervisor.summary", `Data Pipeline [${currentStage}]: ${recordsWritten}/${recordsFetched} records processed`);

  return (
    <Workflow name="data-pipeline">
      <Sequence>
        <Task id="extract" output={outputs.extract} agent={extractAgent} skipIf={!!extract} retries={3}>
          {`Extract data from API ${ctx.input.sourceApiUrl ?? "https://api.example.com/data"}${ctx.input.sourceCsvPath ? ` and CSV ${ctx.input.sourceCsvPath}` : ""}. Save raw data for debugging.`}
        </Task>

        <Task id="validate" output={outputs.validate} agent={validateAgent} skipIf={!extract || !!validate} retries={2}>
          {`Validate ${extract?.recordsFetched ?? 0} extracted records. Remove duplicates, fix invalid values, and preserve cleaned data.`}
        </Task>

        <Task id="transform" output={outputs.transform} agent={transformAgent} skipIf={!validate || !!transform} retries={2}>
          {`Transform ${validate?.recordsValid ?? 0} valid records and calculate useful aggregations.`}
        </Task>

        <Task id="load" output={outputs.load} agent={loadAgent} skipIf={!transform || !!load} retries={3}>
          {`Write transformed records to ${ctx.input.outputDbPath ?? "output.db"} plus any useful export files.`}
        </Task>

        <Task id="report" output={outputs.report} agent={reportAgent} skipIf={!load || !!report} retries={1}>
          {`Generate a pipeline report. Elapsed milliseconds so far: ${Date.now() - startedAt}.`}
        </Task>

        <Task id="done" output={outputs.output}>
          {{
            status: load?.success ? "complete" : "in-progress",
            recordsProcessed: recordsWritten,
            errorCount: (extract?.errors ?? []).length + (validate?.validationErrors ?? []).length,
          }}
        </Task>
      </Sequence>
    </Workflow>
  );
});

process.on("beforeExit", () => {
  updateState("supervisor.status", "done");
  updateState("supervisor.summary", "Data pipeline workflow completed");
});
