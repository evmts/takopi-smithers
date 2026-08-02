// API Builder Workflow
// Demonstrates: Sequential research, scaffolding, implementation, and validation.

import { createSmithers, ClaudeCodeAgent } from "smthrs";
import { z } from "zod";

const inputSchema = z.object({
  apiSpec: z.string().default("API_SPEC.md"),
});

const researchSchema = z.object({
  endpoints: z.array(z.object({
    method: z.string(),
    path: z.string(),
    description: z.string(),
  })).default([]),
  existingFiles: z.array(z.string()).default([]),
  recommendations: z.string(),
});

const scaffoldSchema = z.object({
  filesCreated: z.array(z.string()).default([]),
  summary: z.string(),
});

const implementSchema = z.object({
  endpoint: z.string(),
  filesChanged: z.array(z.string()).default([]),
  testsPassed: z.boolean(),
  summary: z.string(),
});

const validationSchema = z.object({
  allTestsPassed: z.boolean(),
  typeCheckPassed: z.boolean(),
  coveragePercent: z.number().optional(),
  issues: z.array(z.string()).default([]),
});

const outputSchema = z.object({
  endpointsBuilt: z.number(),
  status: z.string(),
});

const { Workflow, Task, Sequence, smithers, outputs, db } = createSmithers(
  {
    input: inputSchema,
    research: researchSchema,
    scaffold: scaffoldSchema,
    implement: implementSchema,
    validation: validationSchema,
    output: outputSchema,
  },
  { dbPath: ".smithers/api-builder.db" }
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
updateState("supervisor.summary", "API Builder workflow initialized");
updateState("supervisor.heartbeat", new Date().toISOString());

const heartbeatTimer = setInterval(() => {
  updateState("supervisor.heartbeat", new Date().toISOString());
}, 30000);
heartbeatTimer.unref?.();

const cliEnv = { ANTHROPIC_API_KEY: "" };

const researchAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are an API architect. Read the API spec and examine the codebase. " +
    "List every endpoint that needs implementation, existing files to reuse, and a concise plan. " +
    "Respond with only JSON matching the research schema.",
});

const scaffoldAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior engineer. Create the API structure, routes, middleware, and types. " +
    "Do not implement business logic yet. Respond with only JSON matching the scaffold schema.",
});

const implementAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior engineer. Implement one endpoint with tests, run the tests, " +
    "and respond with only JSON matching the implement schema.",
});

const validationAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a QA engineer. Run all tests and type checking, summarize coverage and issues, " +
    "and respond with only JSON matching the validation schema.",
});

export default smithers((ctx) => {
  const research = ctx.outputs.research?.[0];
  const scaffold = ctx.outputs.scaffold?.[0];
  const implementations = ctx.outputs.implement ?? [];
  const validation = ctx.outputs.validation?.[0];

  const endpointsToImplement = research?.endpoints ?? [];
  const implementedEndpoints = implementations.map((i: any) => i.endpoint);
  const nextEndpoint = endpointsToImplement.find(
    (ep: any) => !implementedEndpoints.includes(`${ep.method} ${ep.path}`)
  );
  const allImplemented =
    endpointsToImplement.length > 0 &&
    implementedEndpoints.length >= endpointsToImplement.length;

  updateState("supervisor.status", "running");
  updateState(
    "supervisor.summary",
    `API Builder: ${implementedEndpoints.length}/${endpointsToImplement.length} endpoints built`
  );

  return (
    <Workflow name="api-builder">
      <Sequence>
        <Task id="research" output={outputs.research} agent={researchAgent} skipIf={!!research} retries={2}>
          {`Read the API specification at ${ctx.input.apiSpec ?? "API_SPEC.md"}. Analyze the codebase and list the endpoint work.`}
        </Task>

        <Task id="scaffold" output={outputs.scaffold} agent={scaffoldAgent} skipIf={!research || !!scaffold} retries={2}>
          {`Create the basic API structure for these endpoints: ${JSON.stringify(research?.endpoints ?? [])}. Do not implement business logic yet.`}
        </Task>

        <Task id="implement-endpoint" output={outputs.implement} agent={implementAgent} skipIf={!nextEndpoint} retries={2}>
          {nextEndpoint
            ? `Implement endpoint ${nextEndpoint.method} ${nextEndpoint.path}. ${nextEndpoint.description}. Write and run tests.`
            : "No more endpoints to implement."}
        </Task>

        <Task id="validate" output={outputs.validation} agent={validationAgent} skipIf={!allImplemented || !!validation} retries={2}>
          {"Run the full API test suite, type checker, and coverage report. Return remaining issues."}
        </Task>

        <Task id="done" output={outputs.output}>
          {{
            endpointsBuilt: implementedEndpoints.length,
            status: validation?.allTestsPassed && validation?.typeCheckPassed ? "complete" : "in-progress",
          }}
        </Task>
      </Sequence>
    </Workflow>
  );
});

process.on("beforeExit", () => {
  updateState("supervisor.status", "done");
  updateState("supervisor.summary", "API Builder workflow completed");
});
