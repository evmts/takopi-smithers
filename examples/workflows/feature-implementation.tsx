// Feature Implementation Workflow
// Demonstrates: gated feature delivery from design through final validation.

import { createSmithers, ClaudeCodeAgent } from "smithers-orchestrator";
import { z } from "zod";

const inputSchema = z.object({
  featureSpec: z.string().default("FEATURE_SPEC.md"),
});

const designSchema = z.object({
  technicalDesign: z.string(),
  componentsNeeded: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  estimatedFiles: z.number(),
});

const implementationSchema = z.object({
  summary: z.string(),
  filesCreated: z.array(z.string()).default([]),
  testsPassed: z.boolean(),
  testOutput: z.string(),
});

const integrationSchema = z.object({
  summary: z.string(),
  filesChanged: z.array(z.string()).default([]),
  integrationTestsPassed: z.boolean(),
  e2eTestsPassed: z.boolean(),
  testOutput: z.string(),
});

const documentationSchema = z.object({
  filesCreated: z.array(z.string()).default([]),
  docsInclude: z.array(z.string()).default([]),
  summary: z.string(),
});

const finalValidationSchema = z.object({
  allTestsPassed: z.boolean(),
  typeCheckPassed: z.boolean(),
  lintPassed: z.boolean(),
  docsComplete: z.boolean(),
  readyForReview: z.boolean(),
  issues: z.array(z.string()).default([]),
});

const outputSchema = z.object({
  featureComplete: z.boolean(),
  filesCreated: z.number(),
  status: z.string(),
});

const { Workflow, Task, Sequence, smithers, outputs, db } = createSmithers(
  {
    input: inputSchema,
    design: designSchema,
    implement_core: implementationSchema,
    implement_ui: implementationSchema,
    integration: integrationSchema,
    documentation: documentationSchema,
    final_validation: finalValidationSchema,
    output: outputSchema,
  },
  { dbPath: ".smithers/feature.db" }
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
updateState("supervisor.summary", "Feature workflow initialized");
updateState("supervisor.heartbeat", new Date().toISOString());

const heartbeatTimer = setInterval(() => {
  updateState("supervisor.heartbeat", new Date().toISOString());
}, 30000);
heartbeatTimer.unref?.();

const cliEnv = { ANTHROPIC_API_KEY: "" };

const designAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior software architect. Read the feature spec and create a technical design. " +
    "Respond with only JSON matching the design schema.",
});

const coreAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior backend engineer. Implement core logic and unit tests. " +
    "Respond with only JSON matching the implementation schema.",
});

const uiAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior frontend engineer. Implement UI components and component tests. " +
    "Respond with only JSON matching the implementation schema.",
});

const integrationAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior full-stack engineer. Wire the UI to the core logic and run integration tests. " +
    "Respond with only JSON matching the integration schema.",
});

const docsAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a technical writer. Create user-facing docs and API notes. " +
    "Respond with only JSON matching the documentation schema.",
});

const validationAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a QA engineer and tech lead. Run tests, type checker, linter, and docs review. " +
    "Respond with only JSON matching the final validation schema.",
});

export default smithers((ctx) => {
  const design = ctx.outputs.design?.[0];
  const core = ctx.outputs.implement_core?.[0];
  const ui = ctx.outputs.implement_ui?.[0];
  const integration = ctx.outputs.integration?.[0];
  const docs = ctx.outputs.documentation?.[0];
  const validation = ctx.outputs.final_validation?.[0];

  let phase = "design";
  if (!design) phase = "design";
  else if (!core) phase = "implement-core";
  else if (!core.testsPassed) phase = "blocked-core-tests-failed";
  else if (!ui) phase = "implement-ui";
  else if (!ui.testsPassed) phase = "blocked-ui-tests-failed";
  else if (!integration) phase = "integration";
  else if (!integration.integrationTestsPassed || !integration.e2eTestsPassed) phase = "blocked-integration-tests-failed";
  else if (!docs) phase = "documentation";
  else if (!validation) phase = "final-validation";
  else phase = validation.readyForReview ? "ready-for-review" : "blocked-validation-failed";

  const isBlocked = phase.startsWith("blocked-");
  updateState("supervisor.status", isBlocked ? "error" : "running");
  updateState("supervisor.summary", `Feature implementation: ${phase}`);
  if (isBlocked) updateState("supervisor.last_error", `Workflow blocked at phase: ${phase}`);

  return (
    <Workflow name="feature-implementation">
      <Sequence>
        <Task id="design" output={outputs.design} agent={designAgent} skipIf={!!design} retries={2}>
          {`Read the feature specification at ${ctx.input.featureSpec ?? "FEATURE_SPEC.md"} and create a technical design.`}
        </Task>

        <Task id="implement-core" output={outputs.implement_core} agent={coreAgent} skipIf={!design || !!core} retries={2}>
          {design ? `Implement core logic for this design: ${design.technicalDesign}` : "Waiting for design."}
        </Task>

        <Task id="implement-ui" output={outputs.implement_ui} agent={uiAgent} skipIf={!core?.testsPassed || !!ui} retries={2}>
          {core?.testsPassed ? `Implement UI for components: ${JSON.stringify(design?.componentsNeeded ?? [])}` : "Waiting for passing core implementation."}
        </Task>

        <Task id="integration" output={outputs.integration} agent={integrationAgent} skipIf={!ui?.testsPassed || !!integration} retries={2}>
          {ui?.testsPassed ? "Wire the UI to core logic and run integration plus E2E tests." : "Waiting for passing UI implementation."}
        </Task>

        <Task id="documentation" output={outputs.documentation} agent={docsAgent} skipIf={!integration?.integrationTestsPassed || !integration?.e2eTestsPassed || !!docs} retries={2}>
          {"Write user-facing documentation, setup instructions, and API notes for this feature."}
        </Task>

        <Task id="final-validation" output={outputs.final_validation} agent={validationAgent} skipIf={!docs || !!validation} retries={2}>
          {"Run all tests, type checker, linter, and docs review. Decide whether this is ready for review."}
        </Task>

        <Task id="done" output={outputs.output}>
          {{
            featureComplete: validation?.readyForReview ?? false,
            filesCreated: [...(core?.filesCreated ?? []), ...(ui?.filesCreated ?? []), ...(docs?.filesCreated ?? [])].length,
            status: validation?.readyForReview ? "ready-for-review" : phase,
          }}
        </Task>
      </Sequence>
    </Workflow>
  );
});

process.on("beforeExit", () => {
  updateState("supervisor.status", "done");
  updateState("supervisor.summary", "Feature workflow completed");
});
