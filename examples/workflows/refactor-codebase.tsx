// Refactoring Workflow
// Demonstrates: Systematic codebase refactoring with validation
//
// This workflow shows:
// - Parallel task execution (analyze multiple modules concurrently)
// - Branch-based conditional logic (different strategies per module type)
// - Rollback patterns (revert if tests fail)
// - Progressive refactoring (one module at a time, validate before next)

import { smithers, Workflow, Task, Ralph, Branch, Parallel, ClaudeCodeAgent } from "smithers-orchestrator";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Schema - Refactoring pipeline
// ---------------------------------------------------------------------------

const inputTable = sqliteTable("input", {
  runId: text("run_id").primaryKey(),
  refactorGoal: text("refactor_goal").notNull(), // e.g., "Convert to async/await", "Extract interfaces"
});

const analysisTable = sqliteTable(
  "analysis",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    modulesFound: text("modules_found", { mode: "json" }).$type<Array<{
      path: string;
      type: string;
      complexity: number;
      refactoringStrategy: string;
    }>>(),
    estimatedChanges: integer("estimated_changes").notNull(),
    risks: text("risks", { mode: "json" }).$type<string[]>(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

const refactorTable = sqliteTable(
  "refactor",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    iteration: integer("iteration").notNull().default(0),
    modulePath: text("module_path").notNull(),
    strategy: text("strategy").notNull(),
    filesChanged: text("files_changed", { mode: "json" }).$type<string[]>(),
    testsPassed: integer("tests_passed", { mode: "boolean" }).notNull(),
    summary: text("summary").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId, t.iteration] }) })
);

const rollbackTable = sqliteTable(
  "rollback",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    iteration: integer("iteration").notNull().default(0),
    modulePath: text("module_path").notNull(),
    reason: text("reason").notNull(),
    filesReverted: text("files_reverted", { mode: "json" }).$type<string[]>(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId, t.iteration] }) })
);

const validationTable = sqliteTable(
  "validation",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    iteration: integer("iteration").notNull().default(0),
    allTestsPassed: integer("all_tests_passed", { mode: "boolean" }).notNull(),
    typeCheckPassed: integer("type_check_passed", { mode: "boolean" }).notNull(),
    performanceRegression: integer("performance_regression", { mode: "boolean" }),
    issues: text("issues", { mode: "json" }).$type<string[]>(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId, t.iteration] }) })
);

const outputTable = sqliteTable(
  "output",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    modulesRefactored: integer("modules_refactored").notNull(),
    modulesRolledBack: integer("modules_rolled_back").notNull(),
    status: text("status").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

export const schema = {
  input: inputTable,
  analysis: analysisTable,
  refactor: refactorTable,
  rollback: rollbackTable,
  validation: validationTable,
  output: outputTable,
};

export const db = drizzle(".smithers/refactor.db", { schema });

// Create tables
(db as any).$client.exec(`
  CREATE TABLE IF NOT EXISTS input (
    run_id TEXT PRIMARY KEY,
    refactor_goal TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS analysis (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    modules_found TEXT, estimated_changes INTEGER NOT NULL, risks TEXT,
    PRIMARY KEY (run_id, node_id)
  );
  CREATE TABLE IF NOT EXISTS refactor (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL, iteration INTEGER NOT NULL DEFAULT 0,
    module_path TEXT NOT NULL, strategy TEXT NOT NULL,
    files_changed TEXT, tests_passed INTEGER NOT NULL, summary TEXT NOT NULL,
    PRIMARY KEY (run_id, node_id, iteration)
  );
  CREATE TABLE IF NOT EXISTS rollback (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL, iteration INTEGER NOT NULL DEFAULT 0,
    module_path TEXT NOT NULL, reason TEXT NOT NULL, files_reverted TEXT,
    PRIMARY KEY (run_id, node_id, iteration)
  );
  CREATE TABLE IF NOT EXISTS validation (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL, iteration INTEGER NOT NULL DEFAULT 0,
    all_tests_passed INTEGER NOT NULL, type_check_passed INTEGER NOT NULL,
    performance_regression INTEGER, issues TEXT,
    PRIMARY KEY (run_id, node_id, iteration)
  );
  CREATE TABLE IF NOT EXISTS output (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    modules_refactored INTEGER NOT NULL,
    modules_rolled_back INTEGER NOT NULL,
    status TEXT NOT NULL,
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
updateState("supervisor.summary", "Refactoring workflow initialized");
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

const analysisAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior software architect. Analyze the codebase for refactoring. " +
    "Find modules that need work and categorize them by type and complexity. " +
    "Respond with ONLY a JSON object: " +
    '{ "modulesFound": [{"path": "src/utils/helpers.ts", "type": "utility", "complexity": 3, ' +
    '"refactoringStrategy": "extract-interfaces"}], "estimatedChanges": 15, "risks": ["risk1"] }',
});

const refactorAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior engineer. Refactor ONE module according to the strategy. " +
    "Run tests after making changes. If tests fail, explain why. " +
    "Respond with ONLY a JSON object: " +
    '{ "modulePath": "path", "strategy": "strategy", "filesChanged": ["paths"], ' +
    '"testsPassed": true/false, "summary": "string" }',
});

const rollbackAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior engineer. Revert the changes to the module. " +
    "Use git or manual restoration. Verify the code works after rollback. " +
    "Respond with ONLY a JSON object: " +
    '{ "modulePath": "path", "reason": "tests failed", "filesReverted": ["paths"] }',
});

const validationAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a QA engineer. Run full test suite, type checker, and basic performance checks. " +
    "Respond with ONLY a JSON object: " +
    '{ "allTestsPassed": true/false, "typeCheckPassed": true/false, ' +
    '"performanceRegression": false, "issues": ["issue1"] }',
});

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export default smithers(db, (ctx) => {
  const analysis = ctx.outputs.analysis?.[0];
  const refactors = ctx.outputs.refactor ?? [];
  const rollbacks = ctx.outputs.rollback ?? [];
  const validations = ctx.outputs.validation ?? [];

  // Determine which module to refactor next
  const modulesToRefactor = analysis?.modulesFound ?? [];
  const refactoredModules = refactors.map((r: any) => r.modulePath);
  const rolledBackModules = rollbacks.map((r: any) => r.modulePath);

  const nextModule = modulesToRefactor.find(
    (m: any) => !refactoredModules.includes(m.path) && !rolledBackModules.includes(m.path)
  );

  const latestRefactor = refactors[refactors.length - 1];
  const needsRollback = latestRefactor && !latestRefactor.testsPassed &&
    !rolledBackModules.includes(latestRefactor.modulePath);

  const allDone = modulesToRefactor.length > 0 &&
    (refactoredModules.length + rolledBackModules.length) >= modulesToRefactor.length;

  // Update supervisor state
  const successfulRefactors = refactors.filter((r: any) => r.testsPassed).length;
  updateState("supervisor.status", "running");
  updateState(
    "supervisor.summary",
    `Refactoring: ${successfulRefactors}/${modulesToRefactor.length} modules done, ` +
    `${rollbacks.length} rolled back`
  );

  return (
    <Workflow name="refactor-codebase">
      <Ralph until={allDone} maxIterations={100} onMaxReached="return-last">
        {/* ANALYSIS PHASE: Run once at the start */}
        <Task
          id="analyze"
          output={schema.analysis}
          agent={analysisAgent}
          skipIf={!!analysis}
          retries={2}
        >
          {`Analyze the codebase for this refactoring goal: ${ctx.input.refactorGoal ?? "Improve code quality"}. ` +
            "Find all modules that need refactoring. Categorize by type and complexity. " +
            "Recommend a strategy for each module."}
        </Task>

        {/* ROLLBACK PHASE: Handle failed refactorings */}
        <Task
          id="rollback"
          output={schema.rollback}
          agent={rollbackAgent}
          skipIf={!needsRollback}
          retries={1}
        >
          {needsRollback
            ? `Rollback the refactoring of ${latestRefactor.modulePath}. ` +
              `Reason: Tests failed. Files to revert: ${JSON.stringify(latestRefactor.filesChanged)}. ` +
              "Use git to revert or manually restore the original code."
            : "No rollback needed."}
        </Task>

        {/* REFACTOR PHASE: Work on next module */}
        <Task
          id="refactor-module"
          output={schema.refactor}
          agent={refactorAgent}
          skipIf={!nextModule}
          retries={2}
        >
          {nextModule
            ? `Refactor module: ${nextModule.path}. ` +
              `Type: ${nextModule.type}. Complexity: ${nextModule.complexity}/5. ` +
              `Strategy: ${nextModule.refactoringStrategy}. ` +
              "Make the changes and run tests. Ensure tests pass before finishing."
            : "No more modules to refactor."}
        </Task>

        {/* VALIDATION PHASE: Check everything after each successful refactor */}
        <Task
          id="validate"
          output={schema.validation}
          agent={validationAgent}
          skipIf={!latestRefactor || !latestRefactor.testsPassed ||
            validations.some((v: any) => v.iteration === refactors.length - 1)}
          retries={2}
        >
          {latestRefactor?.testsPassed
            ? `Validate the refactoring of ${latestRefactor.modulePath}. ` +
              "Run the full test suite, type checker, and check for performance regressions. " +
              "Report any issues."
            : "Skipping validation - refactoring failed or not ready."}
        </Task>
      </Ralph>

      <Task id="done" output={schema.output}>
        {{
          modulesRefactored: refactors.filter((r: any) => r.testsPassed).length,
          modulesRolledBack: rollbacks.length,
          status: allDone ? "complete" : "incomplete",
        }}
      </Task>
    </Workflow>
  );
});

// Shutdown handlers
process.on("beforeExit", () => {
  try {
    const refactors = (db as any).select().from(schema.refactor).all();
    const successful = refactors.filter((r: any) => r.testsPassed).length;
    updateState("supervisor.status", "done");
    updateState("supervisor.summary", `Refactoring complete: ${successful} modules refactored`);
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
