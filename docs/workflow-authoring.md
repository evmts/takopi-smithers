# Workflow Authoring Guide

This guide explains how to write production-ready Smithers workflows for takopi-smithers.

## Table of Contents

- [Quick Start](#quick-start)
- [Schema Design Best Practices](#schema-design-best-practices)
- [State Key Contract](#state-key-contract)
- [Error Handling Patterns](#error-handling-patterns)
- [Resumability Patterns](#resumability-patterns)
- [Testing Workflows Locally](#testing-workflows-locally)
- [Common Pitfalls](#common-pitfalls)
- [Example Workflows](#example-workflows)

## Quick Start

Every workflow needs these components:

1. **Schema** - Drizzle ORM table definitions for all input/output data
2. **Database** - SQLite database with table creation SQL
3. **State helpers** - Functions to update supervisor state keys
4. **Agents** - ClaudeCodeAgent instances with system prompts
5. **Workflow logic** - TSX tree using `<Workflow>`, `<Task>`, `<Ralph>`, etc.
6. **Shutdown handlers** - Update state on exit

```tsx
import { smithers, Workflow, Task } from "smithers-orchestrator";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sqliteTable, text, primaryKey } from "drizzle-orm/sqlite-core";

// 1. Schema
const inputTable = sqliteTable("input", {
  runId: text("run_id").primaryKey(),
  myInput: text("my_input").notNull(),
});

const outputTable = sqliteTable("output", {
  runId: text("run_id").notNull(),
  nodeId: text("node_id").notNull(),
  result: text("result").notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) }));

export const schema = { input: inputTable, output: outputTable };

// 2. Database
export const db = drizzle(".smithers/my-workflow.db", { schema });
(db as any).$client.exec(`
  CREATE TABLE IF NOT EXISTS input (run_id TEXT PRIMARY KEY, my_input TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS output (run_id TEXT NOT NULL, node_id TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY (run_id, node_id));
  CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')));
`);

// 3. State helpers
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
updateState("supervisor.summary", "Workflow initialized");
updateState("supervisor.heartbeat", new Date().toISOString());

setInterval(() => {
  try {
    updateState("supervisor.heartbeat", new Date().toISOString());
  } catch (err) {
    console.error("Heartbeat failed:", err);
  }
}, 30000);

// 4. Agents
const myAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: { ANTHROPIC_API_KEY: "" },
  systemPrompt: "You are a helpful assistant. Respond with JSON: { \"result\": \"string\" }",
});

// 5. Workflow logic
export default smithers(db, (ctx) => {
  updateState("supervisor.status", "running");
  updateState("supervisor.summary", "Processing...");

  return (
    <Workflow name="my-workflow">
      <Task id="my-task" output={schema.output} agent={myAgent}>
        {`Process this input: ${ctx.input.myInput}`}
      </Task>
    </Workflow>
  );
});

// 6. Shutdown handlers
process.on("beforeExit", () => {
  try {
    updateState("supervisor.status", "done");
    updateState("supervisor.summary", "Workflow complete");
  } catch (err) {
    console.error("Failed to update final state:", err);
  }
});
```

## Schema Design Best Practices

### Use Composite Primary Keys

For tables that track iterations (like plan→implement→review loops), use composite primary keys:

```tsx
const taskTable = sqliteTable(
  "task",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    iteration: integer("iteration").notNull().default(0),
    data: text("data").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId, t.iteration] }) })
);
```

This ensures each execution is uniquely identified and resumable.

### Use JSON Columns for Arrays and Objects

Store complex data types using `{ mode: "json" }`:

```tsx
filesChanged: text("files_changed", { mode: "json" }).$type<string[]>(),
metadata: text("metadata", { mode: "json" }).$type<{ key: string; value: any }[]>(),
```

### Separate Tables for Each Phase

Don't put all data in one table. Create a table per logical phase:

```tsx
// ❌ BAD: Everything in one table
const workTable = sqliteTable("work", {
  runId: text("run_id").primaryKey(),
  plan: text("plan"),
  implementation: text("implementation"),
  review: text("review"),
});

// ✅ GOOD: One table per phase
const planTable = sqliteTable("plan", { ... });
const implementTable = sqliteTable("implement", { ... });
const reviewTable = sqliteTable("review", { ... });
```

This makes the workflow easier to reason about and resume.

### Include a State Table

Always include a `state` table for supervisor state keys:

```sql
CREATE TABLE IF NOT EXISTS state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
```

## State Key Contract

Your workflow **MUST** write these state keys for the supervisor to monitor it:

### Required State Keys

| Key | Type | Description | Update Frequency |
|-----|------|-------------|------------------|
| `supervisor.status` | `"idle" \| "running" \| "error" \| "done"` | Current workflow status | On every iteration |
| `supervisor.summary` | `string` | Human-readable summary (1-3 sentences) | On every iteration |
| `supervisor.heartbeat` | ISO timestamp | Proves the workflow is alive | Every 30 seconds |

### Optional State Keys

| Key | Type | Description |
|-----|------|-------------|
| `supervisor.last_error` | `string` | Most recent error details |

### Best Practices

1. **Update status on every iteration** - The supervisor needs to know the workflow is progressing
2. **Keep summary concise** - 1-3 sentences max, focus on current phase and progress
3. **Update heartbeat in setInterval** - Use a 30-second interval, wrap in try-catch
4. **Set status to "error" on failures** - Helps supervisor decide when to restart
5. **Set status to "done" on exit** - Use `process.on("beforeExit", ...)`

Example:

```tsx
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

// Initialize
updateState("supervisor.status", "running");
updateState("supervisor.summary", "Workflow initialized");
updateState("supervisor.heartbeat", new Date().toISOString());

// Heartbeat
setInterval(() => {
  try {
    updateState("supervisor.heartbeat", new Date().toISOString());
  } catch (err) {
    console.error("Heartbeat failed:", err);
  }
}, 30000);

// In workflow function
export default smithers(db, (ctx) => {
  updateState("supervisor.status", "running");
  updateState("supervisor.summary", `Phase: ${currentPhase} | Progress: ${progress}`);

  return <Workflow>...</Workflow>;
});

// On exit
process.on("beforeExit", () => {
  try {
    updateState("supervisor.status", "done");
    updateState("supervisor.summary", "Workflow completed successfully");
  } catch (err) {
    console.error("Failed to update final state:", err);
  }
});
```

## Error Handling Patterns

### Wrap State Updates in Try-Catch

State updates should never crash your workflow:

```tsx
function updateState(key: string, value: string) {
  try {
    (db as any).$client.run(
      "INSERT OR REPLACE INTO state (key, value, updated_at) VALUES (?, ?, datetime('now'))",
      [key, value]
    );
  } catch (err) {
    console.error(`Failed to update state ${key}:`, err);
    // Don't throw - state updates should not crash the workflow
  }
}
```

### Log Errors to supervisor.last_error

Create a helper to log errors consistently:

```tsx
function logError(error: unknown, context: string) {
  const message = error instanceof Error ? error.message : String(error);
  const errorDetail = `[${context}] ${message}`;
  console.error("Workflow error:", errorDetail);
  updateState("supervisor.last_error", errorDetail);
  updateState("supervisor.status", "error");
}
```

Use it:

```tsx
try {
  // risky operation
} catch (err) {
  logError(err, "task execution");
}
```

### Handle Heartbeat Failures

Track consecutive heartbeat failures and log warnings:

```tsx
let heartbeatFailures = 0;
const MAX_HEARTBEAT_FAILURES = 5;

setInterval(() => {
  try {
    updateState("supervisor.heartbeat", new Date().toISOString());
    heartbeatFailures = 0; // Reset on success
  } catch (err) {
    heartbeatFailures++;
    console.error(`Failed to write heartbeat (attempt ${heartbeatFailures}):`, err);

    if (heartbeatFailures >= MAX_HEARTBEAT_FAILURES) {
      console.error("Heartbeat failures exceeded threshold. Workflow may be marked as hung.");
    }
  }
}, 30000);
```

### Add Global Error Handlers

Catch uncaught errors and update state before exiting:

```tsx
process.on("uncaughtException", (err) => {
  logError(err, "uncaughtException");
  console.error("Uncaught exception - workflow will restart:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logError(reason, "unhandledRejection");
  console.error("Unhandled rejection - workflow will restart:", reason);
  process.exit(1);
});
```

### Use Task Retries

Add `retries={N}` to tasks for transient failures:

```tsx
<Task id="my-task" output={schema.output} agent={myAgent} retries={2}>
  Prompt here
</Task>
```

**When to retry:**
- Network errors
- API rate limits
- Temporary file locks

**When NOT to retry:**
- Logic errors in your code
- Missing dependencies
- Invalid configurations

Fix these by updating the workflow, not adding retries.

## Resumability Patterns

Workflows should be fully resumable across restarts. Here's how:

### Pattern 1: Idempotent Tasks

Skip tasks that have already completed:

```tsx
const research = ctx.outputs.research?.[0];

<Task
  id="research"
  output={schema.research}
  agent={researchAgent}
  skipIf={!!research} // Skip if already done
  retries={2}
>
  Analyze the codebase...
</Task>
```

### Pattern 2: Incremental Progress

Process items one at a time and track which ones are done:

```tsx
const implementations = ctx.outputs.implement ?? [];
const endpointsToImplement = ["GET /users", "POST /users", "DELETE /users/:id"];
const implementedEndpoints = implementations.map((i: any) => i.endpoint);
const nextEndpoint = endpointsToImplement.find(ep => !implementedEndpoints.includes(ep));

<Task
  id="implement-endpoint"
  output={schema.implement}
  agent={implementAgent}
  skipIf={!nextEndpoint} // Skip when all done
  retries={2}
>
  {`Implement endpoint: ${nextEndpoint}`}
</Task>
```

### Pattern 3: Phase State Machines

Compute the current phase from existing outputs:

```tsx
type Phase = "plan" | "implement" | "review" | "fix";

function computePhase(plans: any[], impls: any[], reviews: any[], fixes: any[]): Phase {
  if (plans.length === 0) return "plan";
  if (impls.length < plans.length) return "implement";
  if (reviews.length < plans.length) return "review";
  const latestReview = reviews[reviews.length - 1];
  if (latestReview?.lgtm) return "plan"; // Next task
  return "fix";
}

const phase = computePhase(plans, impls, reviews, fixes);

<Task id="plan" skipIf={phase !== "plan"} ...>
<Task id="implement" skipIf={phase !== "implement"} ...>
<Task id="review" skipIf={phase !== "review"} ...>
<Task id="fix" skipIf={phase !== "fix"} ...>
```

### Pattern 4: Gated Progression

Don't start the next phase until the previous one succeeds:

```tsx
const coreImplemented = ctx.outputs.implement_core?.[0];
const coreTestsPassed = coreImplemented?.testsPassed ?? false;

<Task
  id="implement-ui"
  output={schema.implement_ui}
  agent={uiAgent}
  skipIf={!coreTestsPassed || !!ctx.outputs.implement_ui?.[0]}
  retries={2}
>
  {coreTestsPassed
    ? "Implement the UI..."
    : "Blocked: Core implementation must pass tests first."}
</Task>
```

### Pattern 5: Resume from Incomplete Executions

(Advanced) Query the database for incomplete work:

```tsx
// Find incomplete runs
const incompleteRuns = (db as any).$client
  .query("SELECT * FROM plan WHERE run_id NOT IN (SELECT run_id FROM output)")
  .all();

if (incompleteRuns.length > 0) {
  console.log("Resuming incomplete runs:", incompleteRuns.map(r => r.run_id));
}
```

This pattern is rarely needed since Smithers handles it automatically via `ctx.outputs.*`.

## Testing Workflows Locally

### Option 1: Run with Smithers CLI

```bash
# Install dependencies
bun add smithers-orchestrator zod ai @ai-sdk/anthropic

# Run the workflow
bun --hot .smithers/workflow.tsx --input '{"specPath": "SPEC.md"}'
```

The `--hot` flag reloads the workflow when you edit it.

### Option 2: Use the Supervisor

```bash
# Initialize
bunx takopi-smithers init

# Start the supervisor
bunx takopi-smithers start --dry-run
```

The `--dry-run` flag starts the supervisor without Takopi, so you can test locally.

### Option 3: Query the Database

```bash
# Check state
sqlite3 .smithers/workflow.db "SELECT * FROM state;"

# Check outputs
sqlite3 .smithers/workflow.db "SELECT * FROM plan;"
sqlite3 .smithers/workflow.db "SELECT * FROM implement;"
```

### Option 4: Check Logs

```bash
# View supervisor logs
bunx takopi-smithers logs

# Tail logs in real-time
bunx takopi-smithers logs --follow

# Show only errors
bunx takopi-smithers logs --level error
```

## Common Pitfalls

### ❌ Forgetting to Update Heartbeat

**Problem:** Supervisor thinks the workflow is hung and kills it.

**Solution:** Always include a 30-second heartbeat interval:

```tsx
setInterval(() => {
  try {
    updateState("supervisor.heartbeat", new Date().toISOString());
  } catch (err) {
    console.error("Heartbeat failed:", err);
  }
}, 30000);
```

### ❌ Not Wrapping State Updates in Try-Catch

**Problem:** SQLite errors crash the entire workflow.

**Solution:** Wrap all `updateState()` calls in try-catch:

```tsx
function updateState(key: string, value: string) {
  try {
    (db as any).$client.run(...);
  } catch (err) {
    console.error(`Failed to update state ${key}:`, err);
  }
}
```

### ❌ Using Relative Paths for Database

**Problem:** `drizzle("workflow.db")` creates the DB in the current working directory, which changes.

**Solution:** Use absolute paths or paths relative to `.smithers/`:

```tsx
// ✅ GOOD
export const db = drizzle(".smithers/workflow.db", { schema });

// ❌ BAD
export const db = drizzle("workflow.db", { schema });
```

### ❌ Not Handling Agent Failures

**Problem:** Agent returns invalid JSON and workflow crashes.

**Solution:** Add `retries={2}` to tasks and validate outputs:

```tsx
<Task id="my-task" output={schema.output} agent={myAgent} retries={2}>
  Prompt
</Task>
```

### ❌ Re-executing Completed Work

**Problem:** Workflow restarts and re-runs everything from scratch.

**Solution:** Use `skipIf` to avoid re-executing completed tasks:

```tsx
const research = ctx.outputs.research?.[0];

<Task id="research" output={schema.research} agent={researchAgent} skipIf={!!research}>
```

### ❌ Not Using Composite Primary Keys

**Problem:** Smithers can't track iterations of the same task.

**Solution:** Use composite primary keys with `iteration`:

```tsx
const taskTable = sqliteTable(
  "task",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    iteration: integer("iteration").notNull().default(0),
    data: text("data").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId, t.iteration] }) })
);
```

### ❌ Infinite Loops

**Problem:** Ralph loop never terminates.

**Solution:** Set `maxIterations` and use `onMaxReached="return-last"`:

```tsx
<Ralph until={false} maxIterations={200} onMaxReached="return-last">
  ...
</Ralph>
```

### ❌ Not Testing Locally Before Deployment

**Problem:** Workflow crashes in production and you have to debug via Telegram.

**Solution:** Always test locally first:

```bash
bun --hot .smithers/workflow.tsx --input '{"specPath": "SPEC.md"}'
```

## Example Workflows

See the `examples/workflows/` directory for complete, production-ready examples:

1. **`api-builder.tsx`** - Build REST API endpoints with tests
   - Demonstrates: Sequential tasks, idempotent design, incremental progress

2. **`refactor-codebase.tsx`** - Systematic refactoring workflow
   - Demonstrates: Parallel tasks, rollback patterns, progressive refactoring

3. **`feature-implementation.tsx`** - Multi-step feature with validation
   - Demonstrates: Gated progression, validation checkpoints, comprehensive testing

Each example includes inline comments explaining the patterns used.

## Further Reading

- [Smithers Documentation](https://smithers.sh)
- [takopi-smithers README](../README.md)
- [Troubleshooting Guide](./troubleshooting.md)
- [Worktree Support](./worktrees.md)
