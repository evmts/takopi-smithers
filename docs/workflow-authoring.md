# Workflow Authoring Guide

This guide explains how to write production-ready Smithers workflows for takopi-smithers.

## Quick Start

Every workflow needs these pieces:

1. **Zod schemas** for workflow input and task outputs
2. **`createSmithers`** to create workflow components, output handles, and SQLite storage
3. **Supervisor state helpers** for status, summary, heartbeat, and errors
4. **Agents** such as `ClaudeCodeAgent`
5. **Workflow logic** using `<Workflow>`, `<Task>`, `<Sequence>`, `<Ralph>`, and related components
6. **Shutdown handlers** that mark the workflow done when the process exits

```tsx
import { createSmithers, ClaudeCodeAgent } from "smthrs";
import { z } from "zod";

const inputSchema = z.object({
  myInput: z.string().default("hello"),
});

const outputSchema = z.object({
  result: z.string(),
});

const { Workflow, Task, smithers, outputs, db } = createSmithers(
  {
    input: inputSchema,
    output: outputSchema,
  },
  { dbPath: ".smithers/my-workflow.db" }
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
updateState("supervisor.summary", "Workflow initialized");
updateState("supervisor.heartbeat", new Date().toISOString());

const heartbeatTimer = setInterval(() => {
  updateState("supervisor.heartbeat", new Date().toISOString());
}, 30000);
heartbeatTimer.unref?.();

const agent = new ClaudeCodeAgent({
  model: "sonnet",
  env: { ANTHROPIC_API_KEY: "" },
  systemPrompt: "You are a helpful assistant. Respond with JSON: { \"result\": \"string\" }",
});

export default smithers((ctx) => {
  updateState("supervisor.status", "running");
  updateState("supervisor.summary", "Processing...");

  return (
    <Workflow name="my-workflow">
      <Task id="my-task" output={outputs.output} agent={agent}>
        {`Process this input: ${ctx.input.myInput}`}
      </Task>
    </Workflow>
  );
});

process.on("beforeExit", () => {
  updateState("supervisor.status", "done");
  updateState("supervisor.summary", "Workflow complete");
});
```

## Schema Design

Use one Zod object per logical task output. Give each task a stable `id`, and pass the matching handle from `outputs`.

```tsx
const planSchema = z.object({
  taskName: z.string(),
  prompt: z.string(),
  filesToModify: z.array(z.string()).default([]),
});

const implementSchema = z.object({
  summary: z.string(),
  filesChanged: z.array(z.string()).default([]),
  testsPassed: z.boolean(),
});

const { Workflow, Task, smithers, outputs } = createSmithers({
  plan: planSchema,
  implement: implementSchema,
});
```

Smithers persists task outputs for you. You should only create the extra `state` table because takopi-smithers reads that table for health and status.

## State Key Contract

Your workflow must write these state keys:

| Key | Value | When to update |
| --- | --- | --- |
| `supervisor.status` | `"idle"`, `"running"`, `"error"`, or `"done"` | On startup, phase changes, failures, and exit |
| `supervisor.summary` | A concise status sentence | On every meaningful phase change |
| `supervisor.heartbeat` | ISO timestamp | Every 30 seconds |

Optional:

| Key | Value |
| --- | --- |
| `supervisor.last_error` | Most recent failure details |

Use `heartbeatTimer.unref?.()` so the heartbeat interval does not keep a finished workflow process alive.

## Resumability

Read previous outputs from `ctx.outputs` and use `skipIf` to avoid repeating completed work:

```tsx
export default smithers((ctx) => {
  const research = ctx.outputs.research?.[0];
  const implementation = ctx.outputs.implement?.[0];

  return (
    <Workflow name="resumable-example">
      <Task id="research" output={outputs.research} agent={researchAgent} skipIf={!!research}>
        Research the codebase.
      </Task>

      <Task id="implement" output={outputs.implement} agent={implementAgent} skipIf={!research || !!implementation}>
        {`Implement this plan: ${research?.summary ?? ""}`}
      </Task>
    </Workflow>
  );
});
```

## Testing Locally

Run the workflow directly with the same command used by the supervisor:

```bash
bunx --bun smithers up .smithers/workflow.tsx --input '{"myInput":"hello"}'
```

Then inspect state:

```bash
sqlite3 .smithers/my-workflow.db 'select key, value from state'
```

## Common Pitfalls

- Do not call `smithers(db, ...)`; current Smithers workflows use `createSmithers(...).smithers((ctx) => ...)`.
- Do not import from the old `smithers` package. Use `smthrs`.
- Do not hand-write Smithers output tables. Define Zod schemas and pass `outputs.<name>` to tasks.
- Keep task IDs stable across edits so persisted runs can resume predictably.
- Update `supervisor.summary` whenever phase or progress changes.
- Set `supervisor.status` to `"error"` and write `supervisor.last_error` when a workflow is blocked.

## Examples

See `examples/workflows/` for complete templates:

- `api-builder.tsx`
- `refactor-codebase.tsx`
- `feature-implementation.tsx`
- `data-pipeline.tsx`
- `testing-automation.tsx`
- `basic-ci-cd.tsx`
