// API Builder Workflow
// Demonstrates: Building REST API endpoints with tests and validation
//
// This workflow shows:
// - Sequential task breakdown (research → scaffold → implement → test)
// - Idempotent task design (checks existing work before re-executing)
// - Structured output schemas for API specifications
// - Integration testing patterns

import { smithers, Workflow, Task, Sequence, ClaudeCodeAgent } from "smithers-orchestrator";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Schema - API building pipeline
// ---------------------------------------------------------------------------

const inputTable = sqliteTable("input", {
  runId: text("run_id").primaryKey(),
  apiSpec: text("api_spec").notNull(), // Path to API specification
});

const researchTable = sqliteTable(
  "research",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    endpoints: text("endpoints", { mode: "json" }).$type<Array<{
      method: string;
      path: string;
      description: string;
    }>>(),
    existingFiles: text("existing_files", { mode: "json" }).$type<string[]>(),
    recommendations: text("recommendations").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

const scaffoldTable = sqliteTable(
  "scaffold",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    filesCreated: text("files_created", { mode: "json" }).$type<string[]>(),
    summary: text("summary").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

const implementTable = sqliteTable(
  "implement",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    endpoint: text("endpoint").notNull(),
    filesChanged: text("files_changed", { mode: "json" }).$type<string[]>(),
    testsPassed: integer("tests_passed", { mode: "boolean" }).notNull(),
    summary: text("summary").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

const validationTable = sqliteTable(
  "validation",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    allTestsPassed: integer("all_tests_passed", { mode: "boolean" }).notNull(),
    typeCheckPassed: integer("type_check_passed", { mode: "boolean" }).notNull(),
    coveragePercent: integer("coverage_percent"),
    issues: text("issues", { mode: "json" }).$type<string[]>(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

const outputTable = sqliteTable(
  "output",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    endpointsBuilt: integer("endpoints_built").notNull(),
    status: text("status").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

export const schema = {
  input: inputTable,
  research: researchTable,
  scaffold: scaffoldTable,
  implement: implementTable,
  validation: validationTable,
  output: outputTable,
};

export const db = drizzle(".smithers/api-builder.db", { schema });

// Create tables
(db as any).$client.exec(`
  CREATE TABLE IF NOT EXISTS input (
    run_id TEXT PRIMARY KEY,
    api_spec TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS research (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    endpoints TEXT, existing_files TEXT, recommendations TEXT NOT NULL,
    PRIMARY KEY (run_id, node_id)
  );
  CREATE TABLE IF NOT EXISTS scaffold (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    files_created TEXT, summary TEXT NOT NULL,
    PRIMARY KEY (run_id, node_id)
  );
  CREATE TABLE IF NOT EXISTS implement (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    endpoint TEXT NOT NULL, files_changed TEXT,
    tests_passed INTEGER NOT NULL, summary TEXT NOT NULL,
    PRIMARY KEY (run_id, node_id)
  );
  CREATE TABLE IF NOT EXISTS validation (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    all_tests_passed INTEGER NOT NULL, type_check_passed INTEGER NOT NULL,
    coverage_percent INTEGER, issues TEXT,
    PRIMARY KEY (run_id, node_id)
  );
  CREATE TABLE IF NOT EXISTS output (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    endpoints_built INTEGER NOT NULL, status TEXT NOT NULL,
    PRIMARY KEY (run_id, node_id)
  );
  CREATE TABLE IF NOT EXISTS state (
    key TEXT PRIMARY KEY, value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// ---------------------------------------------------------------------------
// Supervisor state
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
updateState("supervisor.summary", "API Builder workflow initialized");
updateState("supervisor.heartbeat", new Date().toISOString());

setInterval(() => {
  try {
    updateState("supervisor.heartbeat", new Date().toISOString());
  } catch (err) {
    console.error("Heartbeat failed:", err);
  }
}, 30000);

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

const cliEnv = { ANTHROPIC_API_KEY: "" };

const researchAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are an API architect. Read the API spec and examine the codebase. " +
    "List all endpoints that need to be built. Check what files already exist. " +
    "Respond with ONLY a JSON object: " +
    '{ "endpoints": [{"method": "GET", "path": "/api/users", "description": "..."}], ' +
    '"existingFiles": ["src/routes/users.ts"], "recommendations": "string" }',
});

const scaffoldAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior engineer. Create the basic API structure: routes, middleware, types. " +
    "Don't implement business logic yet. " +
    "Respond with ONLY a JSON object: " +
    '{ "filesCreated": ["paths"], "summary": "string" }',
});

const implementAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior engineer. Implement ONE API endpoint with tests. " +
    "Run tests after implementation. " +
    "Respond with ONLY a JSON object: " +
    '{ "endpoint": "GET /api/users", "filesChanged": ["paths"], ' +
    '"testsPassed": true/false, "summary": "string" }',
});

const validationAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a QA engineer. Run all tests, type checker, and check test coverage. " +
    "Respond with ONLY a JSON object: " +
    '{ "allTestsPassed": true/false, "typeCheckPassed": true/false, ' +
    '"coveragePercent": 85, "issues": ["issue1", "issue2"] }',
});

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export default smithers(db, (ctx) => {
  const research = ctx.outputs.research?.[0];
  const scaffold = ctx.outputs.scaffold?.[0];
  const implementations = ctx.outputs.implement ?? [];
  const validation = ctx.outputs.validation?.[0];

  // Determine which endpoint to implement next
  const endpointsToImplement = research?.endpoints ?? [];
  const implementedEndpoints = implementations.map((i: any) => i.endpoint);
  const nextEndpoint = endpointsToImplement.find(
    (ep: any) => !implementedEndpoints.includes(`${ep.method} ${ep.path}`)
  );

  const allImplemented = endpointsToImplement.length > 0 &&
    implementedEndpoints.length >= endpointsToImplement.length;

  // Update supervisor state
  updateState("supervisor.status", "running");
  updateState(
    "supervisor.summary",
    `API Builder: ${implementedEndpoints.length}/${endpointsToImplement.length} endpoints built`
  );

  return (
    <Workflow name="api-builder">
      <Sequence>
        {/* IDEMPOTENT PATTERN: Skip if already done */}
        <Task
          id="research"
          output={schema.research}
          agent={researchAgent}
          skipIf={!!research}
          retries={2}
        >
          {`Read the API specification at ${ctx.input.apiSpec ?? "API_SPEC.md"}. ` +
            "Analyze the codebase to see what already exists. " +
            "List all endpoints that need to be built and recommend an implementation approach."}
        </Task>

        <Task
          id="scaffold"
          output={schema.scaffold}
          agent={scaffoldAgent}
          skipIf={!!scaffold}
          retries={2}
        >
          {`Create the basic API structure for these endpoints: ${JSON.stringify(research?.endpoints ?? [])}. ` +
            "Set up routes, middleware, error handling, and types. Don't implement business logic yet."}
        </Task>

        {/* INCREMENTAL PATTERN: Implement one endpoint at a time */}
        <Task
          id="implement-endpoint"
          output={schema.implement}
          agent={implementAgent}
          skipIf={!nextEndpoint}
          retries={2}
        >
          {nextEndpoint
            ? `Implement endpoint: ${nextEndpoint.method} ${nextEndpoint.path}. ` +
              `Description: ${nextEndpoint.description}. ` +
              "Write tests and run them. Ensure they pass."
            : "No more endpoints to implement."}
        </Task>

        {/* VALIDATION PATTERN: Check everything once all work is done */}
        <Task
          id="validate"
          output={schema.validation}
          agent={validationAgent}
          skipIf={!allImplemented || !!validation}
          retries={2}
        >
          {`All ${endpointsToImplement.length} endpoints have been implemented. ` +
            "Run the full test suite, type checker, and check test coverage. " +
            "Report any issues that need to be fixed."}
        </Task>

        <Task id="done" output={schema.output}>
          {{
            endpointsBuilt: implementedEndpoints.length,
            status: validation?.allTestsPassed && validation?.typeCheckPassed
              ? "complete"
              : "needs_fixes",
          }}
        </Task>
      </Sequence>
    </Workflow>
  );
});

// Shutdown handlers
process.on("beforeExit", () => {
  try {
    updateState("supervisor.status", "done");
    updateState("supervisor.summary", "API Builder workflow complete");
  } catch (err) {
    console.error("Failed to update final state:", err);
  }
});
