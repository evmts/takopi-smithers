import { createSmithers, ClaudeCodeAgent } from "smthrs";
import { z } from "zod";

const commandResultSchema = z.object({
  command: z.string(),
  passed: z.boolean(),
  output: z.string(),
});

const finalSchema = z.object({
  status: z.string(),
  summary: z.string(),
});

const { Workflow, Task, Sequence, smithers, outputs, db } = createSmithers(
  {
    test: commandResultSchema,
    build: commandResultSchema,
    output: finalSchema,
  },
  { dbPath: ".smithers/basic-ci-cd.db" }
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

const agent = new ClaudeCodeAgent({
  model: "sonnet",
  env: { ANTHROPIC_API_KEY: "" },
  systemPrompt: "Run the requested command, summarize the result, and respond with only JSON matching the command result schema.",
});

updateState("supervisor.status", "running");
updateState("supervisor.summary", "CI/CD workflow initialized");
updateState("supervisor.heartbeat", new Date().toISOString());

const heartbeatTimer = setInterval(() => {
  updateState("supervisor.heartbeat", new Date().toISOString());
}, 30000);
heartbeatTimer.unref?.();

export default smithers((ctx) => {
  const test = ctx.outputs.test?.[0];
  const build = ctx.outputs.build?.[0];

  updateState("supervisor.status", "running");
  updateState("supervisor.summary", build ? "Build finished" : test ? "Tests finished" : "Running tests");

  return (
    <Workflow name="basic-ci-cd">
      <Sequence>
        <Task id="run-tests" output={outputs.test} agent={agent} skipIf={!!test} retries={1}>
          {"Run the test suite with `bun test` and report whether it passed."}
        </Task>

        <Task id="build" output={outputs.build} agent={agent} skipIf={!test?.passed || !!build} retries={1}>
          {"Build the project with `bun run build` and verify dist/ output exists."}
        </Task>

        <Task id="done" output={outputs.output}>
          {{
            status: test?.passed && build?.passed ? "done" : "failed-or-incomplete",
            summary: `Tests: ${test?.passed ? "passed" : "not passed"}, build: ${build?.passed ? "passed" : "not passed"}`,
          }}
        </Task>
      </Sequence>
    </Workflow>
  );
});

process.on("beforeExit", () => {
  updateState("supervisor.status", "done");
  updateState("supervisor.summary", "CI/CD workflow completed");
});
