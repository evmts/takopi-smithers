import { smithers, Workflow, Task, Ralph, ClaudeCodeAgent } from "smithers-orchestrator";
import { drizzle } from "drizzle-orm/bun-sqlite";
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
} from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Schema — one table per phase so smithers controls identity, not the agent
// ---------------------------------------------------------------------------

const inputTable = sqliteTable("input", {
  runId: text("run_id").primaryKey(),
  specPath: text("spec_path").notNull(),
});

const planTable = sqliteTable(
  "plan",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    iteration: integer("iteration").notNull().default(0),
    taskName: text("task_name").notNull(),
    research: text("research").notNull(),
    implementationPrompt: text("implementation_prompt").notNull(),
    filesToCreate: text("files_to_create", { mode: "json" }).$type<string[]>(),
    filesToModify: text("files_to_modify", { mode: "json" }).$type<string[]>(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.runId, t.nodeId, t.iteration] }),
  })
);

const implementTable = sqliteTable(
  "implement",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    iteration: integer("iteration").notNull().default(0),
    summary: text("summary").notNull(),
    filesChanged: text("files_changed", { mode: "json" }).$type<string[]>(),
    testOutput: text("test_output").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.runId, t.nodeId, t.iteration] }),
  })
);

const reviewTable = sqliteTable(
  "review",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    iteration: integer("iteration").notNull().default(0),
    lgtm: integer("lgtm", { mode: "boolean" }).notNull(),
    review: text("review").notNull(),
    issues: text("issues", { mode: "json" }).$type<string[]>(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.runId, t.nodeId, t.iteration] }),
  })
);

const fixTable = sqliteTable(
  "fix",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    iteration: integer("iteration").notNull().default(0),
    summary: text("summary").notNull(),
    filesChanged: text("files_changed", { mode: "json" }).$type<string[]>(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.runId, t.nodeId, t.iteration] }),
  })
);

const outputTable = sqliteTable(
  "output",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    totalTasks: integer("total_tasks").notNull(),
    finalStatus: text("final_status").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.runId, t.nodeId] }),
  })
);

export const schema = {
  input: inputTable,
  output: outputTable,
  plan: planTable,
  implement: implementTable,
  review: reviewTable,
  fix: fixTable,
};

export const db = drizzle("./workflow.db", { schema });

(db as any).$client.exec(`
  CREATE TABLE IF NOT EXISTS input (
    run_id TEXT PRIMARY KEY,
    spec_path TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS plan (
    run_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    iteration INTEGER NOT NULL DEFAULT 0,
    task_name TEXT NOT NULL,
    research TEXT NOT NULL,
    implementation_prompt TEXT NOT NULL,
    files_to_create TEXT,
    files_to_modify TEXT,
    PRIMARY KEY (run_id, node_id, iteration)
  );
  CREATE TABLE IF NOT EXISTS implement (
    run_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    iteration INTEGER NOT NULL DEFAULT 0,
    summary TEXT NOT NULL,
    files_changed TEXT,
    test_output TEXT NOT NULL,
    PRIMARY KEY (run_id, node_id, iteration)
  );
  CREATE TABLE IF NOT EXISTS review (
    run_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    iteration INTEGER NOT NULL DEFAULT 0,
    lgtm INTEGER NOT NULL,
    review TEXT NOT NULL,
    issues TEXT,
    PRIMARY KEY (run_id, node_id, iteration)
  );
  CREATE TABLE IF NOT EXISTS fix (
    run_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    iteration INTEGER NOT NULL DEFAULT 0,
    summary TEXT NOT NULL,
    files_changed TEXT,
    PRIMARY KEY (run_id, node_id, iteration)
  );
  CREATE TABLE IF NOT EXISTS output (
    run_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    total_tasks INTEGER NOT NULL,
    final_status TEXT NOT NULL,
    PRIMARY KEY (run_id, node_id)
  );
`);

// ---------------------------------------------------------------------------
// Agents — Claude Code CLI (uses subscription, not API credits)
// ---------------------------------------------------------------------------

const cliEnv = { ANTHROPIC_API_KEY: "" };

const plannerAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: `You are a senior software architect and project planner for the takopi-smithers project.
Your job: figure out the NEXT highest-priority task to implement, research what's needed, and produce a detailed implementation prompt.

Follow the milestone order from the spec (Milestone 0 → 1 → 2 → etc).
Within a milestone, prioritize foundational pieces first.

Key constraints:
- Runtime: Bun (NOT Node.js)
- Use Bun APIs: Bun.serve(), bun:sqlite, Bun.file, Bun.$
- Do NOT use express, dotenv, better-sqlite3, ws, pg, or vite
- Use "bun test" for testing (not jest/vitest)
- HTML imports with Bun.serve() for any frontend (not vite)

Your implementation prompt should be extremely detailed:
- Exact file paths to create/modify
- Exact import statements to use
- Exact function signatures and patterns
- Step-by-step instructions
- What tests to write

IMPORTANT: You MUST respond with ONLY a valid JSON object matching this schema:
{
  "taskName": "string - name of the task",
  "research": "string - research findings",
  "implementationPrompt": "string - detailed implementation instructions",
  "filesToCreate": ["array of file paths to create"],
  "filesToModify": ["array of file paths to modify"]
}`,
});

const implementAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: `You are a senior TypeScript engineer implementing the takopi-smithers CLI tool.

Key constraints:
- Runtime: Bun (NOT Node.js)
- Use Bun APIs: Bun.serve(), bun:sqlite, Bun.file, Bun.$, Bun.spawn
- Do NOT use express, dotenv, better-sqlite3, ws, pg, or vite
- Use "bun test" for testing (not jest/vitest)
- For process management use Bun.spawn / Bun.$
- For file watching use Bun or node:fs watch
- For TOML parsing use a lightweight parser or built-in
- For Telegram API calls use fetch (built-in)

After writing code, ALWAYS run \`bun test\` to verify.
If tests don't exist yet, create basic ones first.

IMPORTANT: You MUST respond with ONLY a valid JSON object matching this schema:
{
  "summary": "string - what was implemented",
  "filesChanged": ["array of files created or modified"],
  "testOutput": "string - output from running tests"
}`,
});

const reviewAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: `You are a senior code reviewer for the takopi-smithers project.

Review checklist:
1. Does the code follow SPEC.md?
2. Does it use Bun APIs correctly (not Node.js alternatives)?
3. Is process management correct (Bun.spawn, graceful shutdown)?
4. Run type check with: bunx tsc --noEmit
5. Run tests with: bun test
6. Code quality, maintainability, security?
7. No express, dotenv, better-sqlite3, ws, pg, or vite usage?

IMPORTANT: Actually run the type checker and tests.
Be strict but fair. Set lgtm=true ONLY if everything is genuinely correct.

You MUST respond with ONLY a valid JSON object matching this schema:
{
  "lgtm": true/false,
  "review": "string - detailed review",
  "issues": ["array of specific issues, empty if lgtm"]
}`,
});

const fixAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: `You are a senior TypeScript engineer fixing code review issues for takopi-smithers.

Key constraints:
- Runtime: Bun (NOT Node.js)
- Use Bun APIs: Bun.serve(), bun:sqlite, Bun.file, Bun.$, Bun.spawn
- Do NOT use express, dotenv, better-sqlite3, ws, pg, or vite

After making changes:
1. Run tests with: bun test
2. Run type check with: bunx tsc --noEmit

IMPORTANT: You MUST respond with ONLY a valid JSON object matching this schema:
{
  "summary": "string - what was fixed",
  "filesChanged": ["array of files changed"]
}`,
});

// ---------------------------------------------------------------------------
// Phase state machine
// ---------------------------------------------------------------------------

type Phase = "plan" | "implement" | "review" | "fix";

function computePhase(
  plans: any[],
  impls: any[],
  reviews: any[],
  fixes: any[],
): Phase {
  const planCount = plans.length;
  const implCount = impls.length;
  const reviewCount = reviews.length;
  const fixCount = fixes.length;

  // No plan yet → plan
  if (planCount === 0) return "plan";

  // Plan exists but no implementation yet → implement
  if (implCount < planCount) return "implement";

  // Implementation exists but no review → review
  if (reviewCount < planCount + fixCount) return "review";

  // Review exists - check result
  const latestReview = reviews[reviews.length - 1];
  if (latestReview?.lgtm) {
    // LGTM! Start planning next task
    return "plan";
  }

  // Review failed - need fixes
  const failedReviewCount = reviews.filter((r: any) => !r.lgtm).length;
  if (fixCount >= failedReviewCount) {
    return "review";
  }

  // Cap fix attempts at 3 per task
  if (fixCount >= 3) return "plan";

  return "fix";
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export default smithers(db, (ctx) => {
  const plans: any[] = ctx.outputs.plan ?? [];
  const impls: any[] = ctx.outputs.implement ?? [];
  const reviews: any[] = ctx.outputs.review ?? [];
  const fixes: any[] = ctx.outputs.fix ?? [];

  const phase = computePhase(plans, impls, reviews, fixes);

  // Build context for prompts
  const latestPlan = plans[plans.length - 1];
  const latestImpl = impls[impls.length - 1];
  const latestReview = reviews[reviews.length - 1];

  const completedTasks = reviews
    .filter((r: any) => r.lgtm)
    .map((_r: any, i: number) => plans[i]?.taskName)
    .filter(Boolean)
    .map((t: string) => `- ${t}`)
    .join("\n");

  return (
    <Workflow name="takopi-smithers-implementation">
      <Ralph until={false} maxIterations={200} onMaxReached="return-last">
        {/* PLAN: pick next task, research, produce implementation prompt */}
        <Task
          id="plan"
          output={schema.plan}
          agent={plannerAgent}
          skipIf={phase !== "plan"}
          retries={2}
        >
          {`Read the project spec at ${ctx.input.specPath} and examine the current codebase to determine the NEXT highest-priority item to implement.

Previously completed tasks (got LGTM):
${completedTasks || "None yet - start with Milestone 0 from the spec."}

Total tasks completed so far: ${reviews.filter((r: any) => r.lgtm).length}

INSTRUCTIONS:
1. Read SPEC.md to understand the full project
2. Examine the codebase: read package.json, list src/ directory, etc.
3. Identify the NEXT uncompleted task in milestone order
4. Research: check dependencies, patterns, docs
5. Write a comprehensive implementation prompt

Remember: this project uses Bun (not Node.js). Check CLAUDE.md for Bun API conventions.

Your implementationPrompt must include:
- Which dependencies to install (if any, via bun add)
- Exact file paths to create
- Exact code to write (full file contents when possible)
- What tests to create
- Step-by-step instructions`}
        </Task>

        {/* IMPLEMENT: execute the plan */}
        <Task
          id="implement"
          output={schema.implement}
          agent={implementAgent}
          skipIf={phase !== "implement"}
          retries={2}
        >
          {`IMPLEMENTATION TASK: ${latestPlan?.taskName ?? "unknown"}

${latestPlan?.implementationPrompt ?? "No implementation prompt available."}

Files to create: ${JSON.stringify(latestPlan?.filesToCreate ?? [])}
Files to modify: ${JSON.stringify(latestPlan?.filesToModify ?? [])}

After implementing, run tests and report results.`}
        </Task>

        {/* REVIEW: check the implementation */}
        <Task
          id="review"
          output={schema.review}
          agent={reviewAgent}
          skipIf={phase !== "review"}
          retries={2}
        >
          {`Review the implementation of: ${latestPlan?.taskName ?? "unknown task"}

Implementation summary: ${latestImpl?.summary ?? "No summary"}
Files changed: ${JSON.stringify(latestImpl?.filesChanged ?? [])}
Test output: ${latestImpl?.testOutput ?? "No test output"}

${latestReview && !latestReview.lgtm ? `Previous review issues:\n${latestReview.issues?.join("\n") ?? "None"}\n\nFixes were applied. Check if previous issues are resolved AND look for new issues.` : "First review of this implementation."}

Read ALL changed files thoroughly. Run type checker and tests.`}
        </Task>

        {/* FIX: address review issues */}
        <Task
          id="fix"
          output={schema.fix}
          agent={fixAgent}
          skipIf={phase !== "fix"}
          retries={2}
        >
          {`Fix the following code review issues for: ${latestPlan?.taskName ?? "unknown task"}

Review feedback:
${latestReview?.review ?? "No review"}

Specific issues to fix:
${latestReview?.issues?.map((issue: string, i: number) => `${i + 1}. ${issue}`).join("\n") ?? "No specific issues listed"}

Files involved: ${JSON.stringify(latestImpl?.filesChanged ?? [])}

Fix each issue. Run tests and type checker after.`}
        </Task>
      </Ralph>

      <Task id="done" output={schema.output}>
        {{
          totalTasks: reviews.filter((r: any) => r.lgtm).length,
          finalStatus: "Implementation loop completed",
        }}
      </Task>
    </Workflow>
  );
});
