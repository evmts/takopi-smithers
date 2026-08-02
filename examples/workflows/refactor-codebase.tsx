// Refactoring Workflow
// Demonstrates: iterative module refactoring with rollback and validation gates.

import { createSmithers, ClaudeCodeAgent } from "smthrs";
import { z } from "zod";

const inputSchema = z.object({
  refactorGoal: z.string().default("Improve code quality"),
});

const moduleSchema = z.object({
  path: z.string(),
  type: z.string(),
  complexity: z.number(),
  refactoringStrategy: z.string(),
});

const analysisSchema = z.object({
  modulesFound: z.array(moduleSchema).default([]),
  estimatedChanges: z.number(),
  risks: z.array(z.string()).default([]),
});

const refactorSchema = z.object({
  modulePath: z.string(),
  strategy: z.string(),
  filesChanged: z.array(z.string()).default([]),
  testsPassed: z.boolean(),
  summary: z.string(),
});

const rollbackSchema = z.object({
  modulePath: z.string(),
  reason: z.string(),
  filesReverted: z.array(z.string()).default([]),
});

const validationSchema = z.object({
  allTestsPassed: z.boolean(),
  typeCheckPassed: z.boolean(),
  performanceRegression: z.boolean().optional(),
  issues: z.array(z.string()).default([]),
});

const outputSchema = z.object({
  modulesRefactored: z.number(),
  modulesRolledBack: z.number(),
  status: z.string(),
});

const { Workflow, Task, Ralph, smithers, outputs, db } = createSmithers(
  {
    input: inputSchema,
    analysis: analysisSchema,
    refactor: refactorSchema,
    rollback: rollbackSchema,
    validation: validationSchema,
    output: outputSchema,
  },
  { dbPath: ".smithers/refactor.db" }
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
updateState("supervisor.summary", "Refactoring workflow initialized");
updateState("supervisor.heartbeat", new Date().toISOString());

const heartbeatTimer = setInterval(() => {
  updateState("supervisor.heartbeat", new Date().toISOString());
}, 30000);
heartbeatTimer.unref?.();

const cliEnv = { ANTHROPIC_API_KEY: "" };

const analysisAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior software architect. Analyze the codebase for the requested refactor. " +
    "Identify modules, risk, and a strategy for each. Respond with only JSON matching the analysis schema.",
});

const refactorAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior engineer. Refactor one module, run focused tests, and respond with " +
    "only JSON matching the refactor schema.",
});

const rollbackAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior engineer. Revert the failed module refactor, verify the workspace, " +
    "and respond with only JSON matching the rollback schema.",
});

const validationAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a QA engineer. Run the full test suite, type checker, and basic performance checks. " +
    "Respond with only JSON matching the validation schema.",
});

export default smithers((ctx) => {
  const analysis = ctx.outputs.analysis?.[0];
  const refactors = ctx.outputs.refactor ?? [];
  const rollbacks = ctx.outputs.rollback ?? [];
  const validations = ctx.outputs.validation ?? [];

  const modulesToRefactor = analysis?.modulesFound ?? [];
  const refactoredModules = refactors.map((r: any) => r.modulePath);
  const rolledBackModules = rollbacks.map((r: any) => r.modulePath);
  const nextModule = modulesToRefactor.find(
    (m: any) => !refactoredModules.includes(m.path) && !rolledBackModules.includes(m.path)
  );

  const latestRefactor = refactors[refactors.length - 1];
  const needsRollback =
    latestRefactor &&
    !latestRefactor.testsPassed &&
    !rolledBackModules.includes(latestRefactor.modulePath);

  const allDone =
    modulesToRefactor.length > 0 &&
    refactoredModules.length + rolledBackModules.length >= modulesToRefactor.length;

  const successfulRefactors = refactors.filter((r: any) => r.testsPassed).length;
  updateState("supervisor.status", "running");
  updateState(
    "supervisor.summary",
    `Refactoring: ${successfulRefactors}/${modulesToRefactor.length} modules done, ${rollbacks.length} rolled back`
  );

  return (
    <Workflow name="refactor-codebase">
      <Ralph until={allDone} maxIterations={100} onMaxReached="return-last">
        <Task id="analyze" output={outputs.analysis} agent={analysisAgent} skipIf={!!analysis} retries={2}>
          {`Analyze the codebase for this refactoring goal: ${ctx.input.refactorGoal ?? "Improve code quality"}.`}
        </Task>

        <Task id="rollback" output={outputs.rollback} agent={rollbackAgent} skipIf={!needsRollback} retries={1}>
          {needsRollback
            ? `Rollback ${latestRefactor.modulePath}. Reason: tests failed. Files: ${JSON.stringify(latestRefactor.filesChanged)}.`
            : "No rollback needed."}
        </Task>

        <Task id="refactor-module" output={outputs.refactor} agent={refactorAgent} skipIf={!nextModule} retries={2}>
          {nextModule
            ? `Refactor ${nextModule.path}. Type: ${nextModule.type}. Strategy: ${nextModule.refactoringStrategy}. Run tests.`
            : "No more modules to refactor."}
        </Task>

        <Task
          id="validate"
          output={outputs.validation}
          agent={validationAgent}
          skipIf={!latestRefactor || !latestRefactor.testsPassed || validations.length >= successfulRefactors}
          retries={2}
        >
          {latestRefactor?.testsPassed
            ? `Validate the refactoring of ${latestRefactor.modulePath}. Run full tests and type checking.`
            : "Skipping validation until a refactor passes."}
        </Task>
      </Ralph>

      <Task id="done" output={outputs.output}>
        {{
          modulesRefactored: successfulRefactors,
          modulesRolledBack: rollbacks.length,
          status: allDone ? "complete" : "incomplete",
        }}
      </Task>
    </Workflow>
  );
});

process.on("beforeExit", () => {
  updateState("supervisor.status", "done");
  updateState("supervisor.summary", "Refactoring workflow completed");
});
