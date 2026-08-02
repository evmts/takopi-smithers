import { createSmithers, ClaudeCodeAgent } from "smthrs";
import { z } from "zod";

const inputSchema = z.object({
  specPath: z.string().default("SPEC.md"),
});

const planSchema = z.object({
  taskName: z.string(),
  research: z.string(),
  implementationPrompt: z.string(),
  filesToCreate: z.array(z.string()).default([]),
  filesToModify: z.array(z.string()).default([]),
});

const implementSchema = z.object({
  summary: z.string(),
  filesChanged: z.array(z.string()).default([]),
  testOutput: z.string(),
});

const reviewSchema = z.object({
  lgtm: z.boolean(),
  review: z.string(),
  issues: z.array(z.string()).default([]),
});

const outputSchema = z.object({
  totalTasks: z.number(),
  finalStatus: z.string(),
});

const { Workflow, Task, Ralph, smithers, outputs, db } = createSmithers(
  {
    input: inputSchema,
    plan: planSchema,
    implement: implementSchema,
    review: reviewSchema,
    output: outputSchema,
  },
  { dbPath: ".smithers/workflow.db" }
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
updateState("supervisor.summary", "Takopi Smithers maintenance workflow initialized");
updateState("supervisor.heartbeat", new Date().toISOString());

const heartbeatTimer = setInterval(() => {
  updateState("supervisor.heartbeat", new Date().toISOString());
}, 30000);
heartbeatTimer.unref?.();

const cliEnv = { ANTHROPIC_API_KEY: "" };

const plannerAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior maintainer. Inspect the repo and pick the next highest-impact task. Respond with only JSON.",
});

const implementAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior TypeScript engineer. Implement the planned task, run verification, and respond with only JSON.",
});

const reviewAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior reviewer. Review the implementation, run checks, and respond with only JSON.",
});

export default smithers((ctx) => {
  const plans = ctx.outputs.plan ?? [];
  const implementations = ctx.outputs.implement ?? [];
  const reviews = ctx.outputs.review ?? [];

  const needsPlan = plans.length === 0 || reviews.at(-1)?.lgtm;
  const needsImplementation = !needsPlan && implementations.length < plans.length;
  const needsReview = !needsPlan && !needsImplementation && reviews.length < implementations.length;

  const latestPlan = plans.at(-1);
  const latestImplementation = implementations.at(-1);
  const completedTasks = reviews.filter((review: any) => review.lgtm).length;

  updateState("supervisor.status", "running");
  updateState("supervisor.summary", `Maintenance workflow: ${completedTasks} accepted tasks`);

  return (
    <Workflow name="takopi-smithers-maintenance">
      <Ralph until={false} maxIterations={100} onMaxReached="return-last">
        <Task id="plan" output={outputs.plan} agent={plannerAgent} skipIf={!needsPlan} retries={2}>
          {`Read ${ctx.input.specPath ?? "SPEC.md"}, inspect the repo, and choose the next conservative improvement.`}
        </Task>

        <Task id="implement" output={outputs.implement} agent={implementAgent} skipIf={!needsImplementation} retries={2}>
          {`Implement this task: ${latestPlan?.taskName ?? "unknown"}. Details: ${latestPlan?.implementationPrompt ?? ""}`}
        </Task>

        <Task id="review" output={outputs.review} agent={reviewAgent} skipIf={!needsReview} retries={2}>
          {`Review the implementation for ${latestPlan?.taskName ?? "unknown"}. Summary: ${latestImplementation?.summary ?? ""}. Tests: ${latestImplementation?.testOutput ?? ""}`}
        </Task>
      </Ralph>

      <Task id="done" output={outputs.output}>
        {{ totalTasks: completedTasks, finalStatus: "running" }}
      </Task>
    </Workflow>
  );
});

process.on("beforeExit", () => {
  updateState("supervisor.status", "done");
  updateState("supervisor.summary", "Takopi Smithers maintenance workflow completed");
});
