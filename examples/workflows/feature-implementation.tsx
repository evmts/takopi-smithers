// Feature Implementation Workflow
// Demonstrates: Multi-step feature development with validation gates
//
// This workflow shows:
// - Gated progression (can't move to next phase until current phase passes)
// - User acceptance simulation (validation checkpoints)
// - Documentation generation (inline with implementation)
// - Comprehensive testing at each stage

import { smithers, Workflow, Task, Sequence, ClaudeCodeAgent } from "smithers-orchestrator";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Schema - Feature implementation pipeline
// ---------------------------------------------------------------------------

const inputTable = sqliteTable("input", {
  runId: text("run_id").primaryKey(),
  featureSpec: text("feature_spec").notNull(),
});

const designTable = sqliteTable(
  "design",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    technicalDesign: text("technical_design").notNull(),
    componentsNeeded: text("components_needed", { mode: "json" }).$type<string[]>(),
    dependencies: text("dependencies", { mode: "json" }).$type<string[]>(),
    risks: text("risks", { mode: "json" }).$type<string[]>(),
    estimatedFiles: integer("estimated_files").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

const implementCoreTable = sqliteTable(
  "implement_core",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    summary: text("summary").notNull(),
    filesCreated: text("files_created", { mode: "json" }).$type<string[]>(),
    coreTestsPassed: integer("core_tests_passed", { mode: "boolean" }).notNull(),
    testOutput: text("test_output").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

const implementUITable = sqliteTable(
  "implement_ui",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    summary: text("summary").notNull(),
    filesCreated: text("files_created", { mode: "json" }).$type<string[]>(),
    uiTestsPassed: integer("ui_tests_passed", { mode: "boolean" }).notNull(),
    testOutput: text("test_output").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

const integrationTable = sqliteTable(
  "integration",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    summary: text("summary").notNull(),
    filesChanged: text("files_changed", { mode: "json" }).$type<string[]>(),
    integrationTestsPassed: integer("integration_tests_passed", { mode: "boolean" }).notNull(),
    e2eTestsPassed: integer("e2e_tests_passed", { mode: "boolean" }).notNull(),
    testOutput: text("test_output").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

const documentationTable = sqliteTable(
  "documentation",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    filesCreated: text("files_created", { mode: "json" }).$type<string[]>(),
    docsInclude: text("docs_include", { mode: "json" }).$type<string[]>(),
    summary: text("summary").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

const finalValidationTable = sqliteTable(
  "final_validation",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    allTestsPassed: integer("all_tests_passed", { mode: "boolean" }).notNull(),
    typeCheckPassed: integer("type_check_passed", { mode: "boolean" }).notNull(),
    lintPassed: integer("lint_passed", { mode: "boolean" }).notNull(),
    docsComplete: integer("docs_complete", { mode: "boolean" }).notNull(),
    readyForReview: integer("ready_for_review", { mode: "boolean" }).notNull(),
    issues: text("issues", { mode: "json" }).$type<string[]>(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

const outputTable = sqliteTable(
  "output",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    featureComplete: integer("feature_complete", { mode: "boolean" }).notNull(),
    filesCreated: integer("files_created").notNull(),
    status: text("status").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

export const schema = {
  input: inputTable,
  design: designTable,
  implement_core: implementCoreTable,
  implement_ui: implementUITable,
  integration: integrationTable,
  documentation: documentationTable,
  final_validation: finalValidationTable,
  output: outputTable,
};

export const db = drizzle(".smithers/feature.db", { schema });

// Create tables
(db as any).$client.exec(`
  CREATE TABLE IF NOT EXISTS input (
    run_id TEXT PRIMARY KEY,
    feature_spec TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS design (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    technical_design TEXT NOT NULL, components_needed TEXT,
    dependencies TEXT, risks TEXT, estimated_files INTEGER NOT NULL,
    PRIMARY KEY (run_id, node_id)
  );
  CREATE TABLE IF NOT EXISTS implement_core (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    summary TEXT NOT NULL, files_created TEXT,
    core_tests_passed INTEGER NOT NULL, test_output TEXT NOT NULL,
    PRIMARY KEY (run_id, node_id)
  );
  CREATE TABLE IF NOT EXISTS implement_ui (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    summary TEXT NOT NULL, files_created TEXT,
    ui_tests_passed INTEGER NOT NULL, test_output TEXT NOT NULL,
    PRIMARY KEY (run_id, node_id)
  );
  CREATE TABLE IF NOT EXISTS integration (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    summary TEXT NOT NULL, files_changed TEXT,
    integration_tests_passed INTEGER NOT NULL,
    e2e_tests_passed INTEGER NOT NULL, test_output TEXT NOT NULL,
    PRIMARY KEY (run_id, node_id)
  );
  CREATE TABLE IF NOT EXISTS documentation (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    files_created TEXT, docs_include TEXT, summary TEXT NOT NULL,
    PRIMARY KEY (run_id, node_id)
  );
  CREATE TABLE IF NOT EXISTS final_validation (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    all_tests_passed INTEGER NOT NULL, type_check_passed INTEGER NOT NULL,
    lint_passed INTEGER NOT NULL, docs_complete INTEGER NOT NULL,
    ready_for_review INTEGER NOT NULL, issues TEXT,
    PRIMARY KEY (run_id, node_id)
  );
  CREATE TABLE IF NOT EXISTS output (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    feature_complete INTEGER NOT NULL,
    files_created INTEGER NOT NULL, status TEXT NOT NULL,
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

function logError(error: unknown, context: string) {
  const message = error instanceof Error ? error.message : String(error);
  updateState("supervisor.last_error", `[${context}] ${message}`);
  updateState("supervisor.status", "error");
}

updateState("supervisor.status", "running");
updateState("supervisor.summary", "Feature implementation workflow initialized");
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

const designAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior software architect. Read the feature spec and create a technical design. " +
    "List components, dependencies, risks, and estimate file count. " +
    "Respond with ONLY a JSON object: " +
    '{ "technicalDesign": "detailed design doc", "componentsNeeded": ["Component1"], ' +
    '"dependencies": ["dep1"], "risks": ["risk1"], "estimatedFiles": 10 }',
});

const coreAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior backend engineer. Implement the core business logic and data layer. " +
    "Write unit tests for all functions. Run tests and ensure they pass. " +
    "Respond with ONLY a JSON object: " +
    '{ "summary": "string", "filesCreated": ["paths"], ' +
    '"coreTestsPassed": true/false, "testOutput": "string" }',
});

const uiAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior frontend engineer. Implement the UI components. " +
    "Write component tests. Run tests and ensure they pass. " +
    "Respond with ONLY a JSON object: " +
    '{ "summary": "string", "filesCreated": ["paths"], ' +
    '"uiTestsPassed": true/false, "testOutput": "string" }',
});

const integrationAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior full-stack engineer. Wire up the UI to the core logic. " +
    "Write integration tests and E2E tests. Run all tests. " +
    "Respond with ONLY a JSON object: " +
    '{ "summary": "string", "filesChanged": ["paths"], ' +
    '"integrationTestsPassed": true/false, "e2eTestsPassed": true/false, "testOutput": "string" }',
});

const docsAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a technical writer. Write user-facing documentation and API docs. " +
    "Include usage examples, setup instructions, and API reference. " +
    "Respond with ONLY a JSON object: " +
    '{ "filesCreated": ["docs/feature-guide.md"], ' +
    '"docsInclude": ["setup", "api-reference", "examples"], "summary": "string" }',
});

const validationAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a QA engineer and tech lead. Run all tests, type checker, linter. " +
    "Check that documentation is complete. Determine if the feature is ready for code review. " +
    "Respond with ONLY a JSON object: " +
    '{ "allTestsPassed": true/false, "typeCheckPassed": true/false, ' +
    '"lintPassed": true/false, "docsComplete": true/false, ' +
    '"readyForReview": true/false, "issues": ["issue1"] }',
});

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export default smithers(db, (ctx) => {
  const design = ctx.outputs.design?.[0];
  const core = ctx.outputs.implement_core?.[0];
  const ui = ctx.outputs.implement_ui?.[0];
  const integration = ctx.outputs.integration?.[0];
  const docs = ctx.outputs.documentation?.[0];
  const validation = ctx.outputs.final_validation?.[0];

  // Compute current phase
  let phase = "design";
  if (!design) phase = "design";
  else if (!core) phase = "implement-core";
  else if (!core.coreTestsPassed) phase = "blocked-core-tests-failed";
  else if (!ui) phase = "implement-ui";
  else if (!ui.uiTestsPassed) phase = "blocked-ui-tests-failed";
  else if (!integration) phase = "integration";
  else if (!integration.integrationTestsPassed || !integration.e2eTestsPassed)
    phase = "blocked-integration-tests-failed";
  else if (!docs) phase = "documentation";
  else if (!validation) phase = "final-validation";
  else if (validation.readyForReview) phase = "ready-for-review";
  else phase = "blocked-validation-failed";

  const isBlocked = phase.startsWith("blocked-");

  // Update supervisor state
  updateState("supervisor.status", isBlocked ? "error" : "running");
  updateState("supervisor.summary", `Feature implementation: ${phase}`);
  if (isBlocked) {
    updateState("supervisor.last_error", `Workflow blocked at phase: ${phase}`);
  }

  return (
    <Workflow name="feature-implementation">
      <Sequence>
        {/* GATED PROGRESSION PATTERN: Each phase must succeed before next can start */}

        <Task
          id="design"
          output={schema.design}
          agent={designAgent}
          skipIf={!!design}
          retries={2}
        >
          {`Read the feature specification at ${ctx.input.featureSpec ?? "FEATURE_SPEC.md"}. ` +
            "Create a detailed technical design. List all components, dependencies, and risks. " +
            "Estimate how many files will be needed."}
        </Task>

        <Task
          id="implement-core"
          output={schema.implement_core}
          agent={coreAgent}
          skipIf={!design || !!core}
          retries={2}
        >
          {design
            ? `Implement the core business logic for this feature. ` +
              `Components needed: ${JSON.stringify(design.componentsNeeded)}. ` +
              `Design: ${design.technicalDesign}. ` +
              "Write unit tests for all functions. Run tests and ensure they pass."
            : "Waiting for design phase to complete."}
        </Task>

        {/* VALIDATION GATE: Core tests must pass */}
        <Task
          id="implement-ui"
          output={schema.implement_ui}
          agent={uiAgent}
          skipIf={!core || !core.coreTestsPassed || !!ui}
          retries={2}
        >
          {core?.coreTestsPassed
            ? `Implement the UI components for this feature. ` +
              `Design: ${design?.technicalDesign}. ` +
              "Write component tests. Run tests and ensure they pass."
            : "Blocked: Core implementation must pass tests first."}
        </Task>

        {/* VALIDATION GATE: UI tests must pass */}
        <Task
          id="integration"
          output={schema.integration}
          agent={integrationAgent}
          skipIf={!ui || !ui.uiTestsPassed || !!integration}
          retries={2}
        >
          {ui?.uiTestsPassed
            ? "Wire up the UI to the core logic. Write integration tests and E2E tests. " +
              "Run all tests and ensure they pass."
            : "Blocked: UI implementation must pass tests first."}
        </Task>

        {/* VALIDATION GATE: Integration tests must pass */}
        <Task
          id="documentation"
          output={schema.documentation}
          agent={docsAgent}
          skipIf={!integration ||
            !integration.integrationTestsPassed ||
            !integration.e2eTestsPassed ||
            !!docs}
          retries={2}
        >
          {integration?.integrationTestsPassed && integration?.e2eTestsPassed
            ? `Write documentation for this feature. ` +
              `Include setup instructions, usage examples, and API reference. ` +
              `Feature: ${ctx.input.featureSpec}.`
            : "Blocked: Integration tests must pass first."}
        </Task>

        {/* FINAL VALIDATION: Everything must be perfect */}
        <Task
          id="final-validation"
          output={schema.final_validation}
          agent={validationAgent}
          skipIf={!docs || !!validation}
          retries={2}
        >
          {docs
            ? "Run all tests (unit, integration, E2E), type checker, and linter. " +
              "Verify documentation is complete. " +
              "Determine if the feature is ready for code review."
            : "Blocked: Documentation must be complete first."}
        </Task>

        <Task id="done" output={schema.output}>
          {{
            featureComplete: validation?.readyForReview ?? false,
            filesCreated:
              (core?.filesCreated?.length ?? 0) +
              (ui?.filesCreated?.length ?? 0) +
              (docs?.filesCreated?.length ?? 0),
            status: validation?.readyForReview ? "ready-for-review" : "incomplete",
          }}
        </Task>
      </Sequence>
    </Workflow>
  );
});

// Shutdown handlers
process.on("beforeExit", () => {
  try {
    const validation = (db as any)
      .select()
      .from(schema.final_validation)
      .limit(1)
      .all()[0];
    const status = validation?.readyForReview ? "complete" : "incomplete";
    updateState("supervisor.status", "done");
    updateState("supervisor.summary", `Feature implementation ${status}`);
  } catch (err) {
    console.error("Failed to update final state:", err);
  }
});

process.on("uncaughtException", (err) => {
  logError(err, "uncaughtException");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logError(reason, "unhandledRejection");
  process.exit(1);
});
