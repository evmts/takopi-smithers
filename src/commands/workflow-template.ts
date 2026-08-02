// Workflow template for `takopi-smithers init`.
// Smithers owns workflow storage through createSmithers; Takopi only adds a
// small supervisor state table for status, heartbeat, and operator summaries.

export const WORKFLOW_TEMPLATE = `import { createSmithers, ClaudeCodeAgent } from "smthrs";
import { z } from "zod";

const inputSchema = z.object({
  specPath: z.string().default("SPEC.md"),
});

const planOutputSchema = z.object({
  taskName: z.string(),
  research: z.string(),
  implementationPrompt: z.string(),
  filesToCreate: z.array(z.string()).default([]),
  filesToModify: z.array(z.string()).default([]),
});

const implementOutputSchema = z.object({
  summary: z.string(),
  filesChanged: z.array(z.string()).default([]),
  testOutput: z.string(),
});

const reviewOutputSchema = z.object({
  lgtm: z.boolean(),
  review: z.string(),
  issues: z.array(z.string()).default([]),
});

const fixOutputSchema = z.object({
  summary: z.string(),
  filesChanged: z.array(z.string()).default([]),
});

const finalOutputSchema = z.object({
  totalTasks: z.number(),
  finalStatus: z.string(),
});

const { Workflow, Task, Ralph, smithers, outputs, db } = createSmithers(
  {
    input: inputSchema,
    plan: planOutputSchema,
    implement: implementOutputSchema,
    review: reviewOutputSchema,
    fix: fixOutputSchema,
    output: finalOutputSchema,
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
].join("\\n"));

function updateState(key: string, value: string) {
  try {
    sqlite.run(
      "INSERT OR REPLACE INTO state (key, value, updated_at) VALUES (?, ?, datetime('now'))",
      [key, value]
    );
  } catch (err) {
    console.error("Failed to update state " + key + ":", err);
  }
}

updateState("supervisor.status", "running");
updateState("supervisor.summary", "Workflow initialized");
updateState("supervisor.heartbeat", new Date().toISOString());

const heartbeatTimer = setInterval(() => {
  updateState("supervisor.heartbeat", new Date().toISOString());
}, 30000);
heartbeatTimer.unref?.();

const cliEnv = { ANTHROPIC_API_KEY: "" };

const plannerAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior software architect. Read the spec, examine the codebase, " +
    "and pick the NEXT highest-priority task. Produce a detailed implementation prompt. " +
    "Respond with ONLY a JSON object: " +
    "{ \\"taskName\\": \\"string\\", \\"research\\": \\"string\\", \\"implementationPrompt\\": \\"string\\", " +
    "\\"filesToCreate\\": [\\"paths\\"], \\"filesToModify\\": [\\"paths\\"] }",
});

const implementAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior TypeScript engineer. Implement the task described below. " +
    "After writing code, ALWAYS run tests to verify. " +
    "Respond with ONLY a JSON object: " +
    "{ \\"summary\\": \\"string\\", \\"filesChanged\\": [\\"paths\\"], \\"testOutput\\": \\"string\\" }",
});

const reviewAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior code reviewer. Run type checker and tests. " +
    "Set lgtm=true ONLY if everything is correct. " +
    "Respond with ONLY a JSON object: " +
    "{ \\"lgtm\\": true, \\"review\\": \\"string\\", \\"issues\\": [\\"specific issues\\"] }",
});

const fixAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior TypeScript engineer fixing code review issues. " +
    "After making changes, run tests and type checker. " +
    "Respond with ONLY a JSON object: " +
    "{ \\"summary\\": \\"string\\", \\"filesChanged\\": [\\"paths\\"] }",
});

type Phase = "plan" | "implement" | "review" | "fix";

function computePhase(plans: any[], impls: any[], reviews: any[], fixes: any[]): Phase {
  if (plans.length === 0) return "plan";
  if (impls.length < plans.length) return "implement";
  if (reviews.length < plans.length + fixes.length) return "review";
  const latestReview = reviews[reviews.length - 1];
  if (latestReview?.lgtm) return "plan";
  if (fixes.length >= reviews.filter((r: any) => !r.lgtm).length) return "review";
  if (fixes.length >= 3) return "plan";
  return "fix";
}

export default smithers((ctx) => {
  const plans: any[] = ctx.outputs.plan ?? [];
  const impls: any[] = ctx.outputs.implement ?? [];
  const reviews: any[] = ctx.outputs.review ?? [];
  const fixes: any[] = ctx.outputs.fix ?? [];

  const phase = computePhase(plans, impls, reviews, fixes);
  const latestPlan = plans[plans.length - 1];
  const latestImpl = impls[impls.length - 1];
  const latestReview = reviews[reviews.length - 1];

  const completedTasks = reviews
    .filter((r: any) => r.lgtm)
    .map((_r: any, i: number) => plans[i]?.taskName)
    .filter(Boolean)
    .join(", ");

  updateState("supervisor.status", "running");
  updateState(
    "supervisor.summary",
    "Phase: " + phase + " | Tasks done: " + reviews.filter((r: any) => r.lgtm).length
  );

  return (
    <Workflow name="my-workflow">
      <Ralph until={false} maxIterations={200} onMaxReached="return-last">
        <Task id="plan" output={outputs.plan} agent={plannerAgent} skipIf={phase !== "plan"} retries={2}>
          {"Read the project spec at " + (ctx.input.specPath ?? "SPEC.md") + " and examine the codebase. Completed tasks: " + (completedTasks || "None yet") + ". Pick the NEXT task. Research what is needed. Write a detailed implementation prompt."}
        </Task>

        <Task id="implement" output={outputs.implement} agent={implementAgent} skipIf={phase !== "implement"} retries={2}>
          {"TASK: " + (latestPlan?.taskName ?? "unknown") + " -- " + (latestPlan?.implementationPrompt ?? "No implementation prompt.") + " Files to create: " + JSON.stringify(latestPlan?.filesToCreate ?? []) + " Files to modify: " + JSON.stringify(latestPlan?.filesToModify ?? []) + " After implementing, run tests and report results."}
        </Task>

        <Task id="review" output={outputs.review} agent={reviewAgent} skipIf={phase !== "review"} retries={2}>
          {"Review: " + (latestPlan?.taskName ?? "unknown") + " | Summary: " + (latestImpl?.summary ?? "No summary") + " | Files: " + JSON.stringify(latestImpl?.filesChanged ?? []) + " | Tests: " + (latestImpl?.testOutput ?? "No test output") + " -- Read ALL changed files. Run type checker and tests."}
        </Task>

        <Task id="fix" output={outputs.fix} agent={fixAgent} skipIf={phase !== "fix"} retries={2}>
          {"Fix review issues for: " + (latestPlan?.taskName ?? "unknown") + " Issues: " + (latestReview?.issues?.map((issue: string, i: number) => (i + 1) + ". " + issue).join(", ") ?? "None") + " Fix each issue. Run tests after."}
        </Task>
      </Ralph>

      <Task id="done" output={outputs.output}>
        {{ totalTasks: reviews.filter((r: any) => r.lgtm).length, finalStatus: "done" }}
      </Task>
    </Workflow>
  );
});

process.on("beforeExit", () => {
  updateState("supervisor.status", "done");
  updateState("supervisor.summary", "Workflow completed successfully");
});
`;
