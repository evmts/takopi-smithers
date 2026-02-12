# takopi-smithers Architecture

This document describes the internal architecture, process model, and state management patterns.

## Process Model

```
┌──────────────────────────┐
│ bunx takopi-smithers ... │
└─────────────┬────────────┘
              │ spawns
   ┌──────────▼──────────┐         ┌──────────────────────────┐
   │ takopi (python/uv)  │<───────▶│ Telegram (Bot API)        │
   └──────────┬──────────┘         └──────────────────────────┘
              │ runs agent CLIs in repo
              ▼
   ┌──────────────────────┐
   │ agent CLI (claude/…) │  (edits repo, responds in chat)
   └──────────────────────┘

   ┌──────────────────────────────┐
   │ smithers workflow runner      │  bunx smithers-orchestrator
   │ (TSX React plan, SQLite DB)   │
   └──────────┬───────────────────┘
              │ writes state/frames/artifacts
              ▼
   ┌──────────────────────────────┐
   │ .smithers/workflow.db        │
   └──────────────────────────────┘

   ┌──────────────────────────────┐
   │ takopi-smithers supervisor    │  (same bun process as CLI start)
   │ - cron updates                │
   │ - health checks               │
   │ - auto restart / auto heal    │
   └──────────────────────────────┘
```

### Process Lifecycle

1. **Startup** (`takopi-smithers start`):
   - Supervisor process starts
   - Spawns Takopi subprocess (`takopi` CLI)
   - Spawns Smithers subprocess (`bunx smithers-orchestrator .smithers/workflow.tsx`)
   - Starts file watcher on workflow.tsx
   - Starts health check loop (every 10s)
   - Starts update cron (every 10min default)

2. **Normal Operation**:
   - Takopi polls Telegram, runs agent CLIs in response to messages
   - Smithers executes workflow, writes state to SQLite
   - Supervisor monitors heartbeat, sends periodic updates

3. **Crash/Hang**:
   - Supervisor detects via exit code or stale heartbeat
   - Optionally runs auto-heal (Claude Code repair prompt)
   - Restarts Smithers with backoff schedule

4. **Shutdown** (`takopi-smithers stop` or SIGINT/SIGTERM):
   - Supervisor kills Smithers subprocess
   - Supervisor kills Takopi subprocess
   - Clears all timers/intervals
   - Exits cleanly

## State Keys Contract

The supervisor and workflow communicate via SQLite state keys:

| Key                      | Type      | Description                                    | Writer   | Reader     |
|--------------------------|-----------|------------------------------------------------|----------|------------|
| `supervisor.heartbeat`   | ISO 8601  | Updated every 30s by workflow                  | Workflow | Supervisor |
| `supervisor.status`      | string    | `idle`, `running`, `error`, `done`             | Workflow | Supervisor |
| `supervisor.summary`     | string    | 1-3 sentence human-readable status             | Workflow | Supervisor |
| `supervisor.last_error`  | string    | Most recent failure details                    | Workflow | Supervisor |

**Implementation:**

In the workflow (`.smithers/workflow.tsx`):

```tsx
import { db } from 'smithers';

// Update heartbeat every 30s
setInterval(() => {
  db.state.set('supervisor.heartbeat', new Date().toISOString());
}, 30000);

// Update status and summary as workflow progresses
db.state.set('supervisor.status', 'running');
db.state.set('supervisor.summary', 'Processing phase 2 of 5: data validation');
```

In the supervisor (`src/lib/db.ts`):

```typescript
import Database from 'bun:sqlite';

export function queryWorkflowState(dbPath: string) {
  const db = new Database(dbPath, { readonly: true });

  const query = db.prepare(
    'SELECT key, value FROM state WHERE key LIKE "supervisor.%"'
  );

  const rows = query.all() as { key: string; value: string }[];
  // ... parse and return
}
```

## Restart & Backoff Strategy

### Backoff Schedule

Defined in `.takopi-smithers/config.toml`:

```toml
[health]
restart_backoff_seconds = [5, 30, 120, 600]
max_restart_attempts = 20
```

**Logic:**
1. First crash → wait 5s, restart (attempt 1)
2. Second crash → wait 30s, restart (attempt 2)
3. Third crash → wait 120s, restart (attempt 3)
4. Fourth+ crashes → wait 600s (10min), restart
5. After 20 attempts → stop trying, log error

### Counter Resets

Restart attempt counter resets to 0 on:
- Manual restart (`takopi-smithers restart`)
- Workflow file change (file watcher trigger)
- Successful auto-heal

### Auto-Heal Integration

If `autoheal.enabled = true`:
1. On crash, capture context (logs, DB state, workflow file)
2. Build repair prompt
3. Invoke Claude Code via `claude -p <prompt> .smithers/workflow.tsx`
4. If successful → reset counters, restart immediately
5. If failed → fall back to normal backoff restart
6. Max auto-heal attempts: 3 (then disable auto-heal for this session)

## Cron Update Production

### Update Timing

Every `updates.interval_seconds` (default 600 = 10 minutes):

1. Query workflow state from SQLite
2. Get repo name and branch via `git`
3. Format message
4. Send to Telegram

### Message Format

```
📊 takopi-smithers Update

Repo: myproject (main)
Status: running
Summary: Processing batch 3/10, 150 items completed
Heartbeat: 15s ago ✅

Next update in 10 minutes
```

**Dry-run mode:**

Run with `--dry-run` to print messages to console instead of sending:

```bash
bunx takopi-smithers start --dry-run
```

## File Watch & Hot Reload

### Watched Files

- `.smithers/workflow.tsx` (primary workflow file)

### Debounce Strategy

File changes are debounced with 2-second window:

1. File change detected
2. Start 2s timer
3. If another change occurs → reset timer
4. After 2s of stability → trigger restart

This prevents multiple restarts during rapid file edits (e.g., auto-save in editor).

### Restart Process

1. Log: "Restarting Smithers due to workflow file change..."
2. Reset restart/auto-heal attempt counters (this is intentional, not a crash)
3. Kill existing Smithers subprocess
4. Wait for clean exit
5. Spawn new Smithers subprocess
6. Send Telegram notification: "🔄 Workflow Reloaded"

## Logging

### Log Files

- `.takopi-smithers/logs/supervisor.log` – supervisor events, health checks, restarts
- Smithers logs are written to stdout/stderr (captured by supervisor)
- Takopi logs to stdout/stderr (passed through)

### Log Format

```
[2026-02-11T23:01:15.924Z] [info] Starting supervisor...
[2026-02-11T23:01:16.124Z] [info] Takopi started with PID 12345
[2026-02-11T23:01:16.324Z] [info] Smithers started with PID 12346
[2026-02-11T23:11:16.124Z] [warn] Health check: Heartbeat is stale (threshold: 300s)
[2026-02-11T23:11:20.124Z] [error] Smithers exited with code 1, signal null
```

### Log Levels

- `info` – normal operation (startup, shutdown, status updates)
- `warn` – non-fatal issues (stale heartbeat, missing config)
- `error` – failures (crash, restart, auto-heal failure)

## Database Schema

### Smithers Internal Tables

Smithers creates these tables (prefixed with `_smithers_`):

- `_smithers_runs` – execution metadata
- `_smithers_frames` – workflow execution frames
- `_smithers_artifacts` – files and outputs
- `state` – key-value store (our integration point)

### State Table Schema

```sql
CREATE TABLE state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

**Usage:**

```sql
-- Workflow writes
INSERT OR REPLACE INTO state (key, value) VALUES ('supervisor.heartbeat', '2026-02-11T23:01:15.924Z');

-- Supervisor reads
SELECT value FROM state WHERE key = 'supervisor.heartbeat';
```

## Configuration Hierarchy

### Telegram Credentials

Credentials are resolved in this order:

1. `.takopi-smithers/config.toml` (local, repo-specific)
2. `~/.takopi/takopi.toml` (global, user-level)

If both are empty → warn and skip updates.

### Auto-Heal Engine

Configured in `.takopi-smithers/config.toml`:

```toml
[autoheal]
enabled = true
engine = "claude"  # claude|codex|opencode|pi
max_attempts = 3
```

**Engine Adapters (v1.0):**

- `claude` – Implemented (uses `claude -p` non-interactive mode)
- `codex` – Not yet implemented (would use `codex exec --json`)
- `opencode`, `pi` – Not yet implemented

If engine is not `claude` and auto-heal is enabled → fall back to restart-only.

## Security Model

### Permissions

- Supervisor runs as current user
- Takopi subprocess inherits user permissions
- Smithers subprocess inherits user permissions
- Agent CLIs run with full repo read/write access

### Secrets

- Telegram bot token stored in config files (gitignored)
- Agent API keys (Anthropic, OpenAI) stored in agent CLI configs or env vars
- SQLite DB is unencrypted (contains workflow state, not secrets)

### Isolation

No process isolation beyond standard OS user permissions. This is a single-user, single-repo tool.

## Resumability

Smithers workflows can resume after crash via:

```tsx
import { db } from 'smithers';

// Check for incomplete execution
const incomplete = db.execution.findIncomplete();

if (incomplete) {
  // Resume from last checkpoint
  // ...
} else {
  // Start new execution
  // ...
}
```

The workflow template created by `takopi-smithers init` includes this pattern.
