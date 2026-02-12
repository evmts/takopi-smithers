## takopi-smithers design

**Goal:** a single `bunx`/`npx` command that boots (1) **Takopi** for Telegram control and (2) a **Smithers** long‑running workflow in the current repo, plus a **supervisor** that posts periodic updates (default every 10 minutes), monitors health, and self-heals by restarting and (optionally) auto-fixing the workflow when it breaks.

This is explicitly for **solo devs / small teams**, POC-friendly, “run it in the repo and it just works.”

### What we’re composing

- **Takopi**: Telegram bridge that runs agent CLIs (Codex / Claude Code / OpenCode / Pi), keeps threads resumable, and supports workflows like “assistant” mode. ([PyPI][1])
- **Smithers**: React-based orchestration framework where the “plan” is TSX code; state is persisted in SQLite; can be resumed after crash; intended for long-running, self-healing agent workflows. ([Smithers][2])

### Key product decisions

1. **One workflow per repo (v1):** one Smithers script path and one SQLite DB path.
2. **Repo-local “agent instructions” file** is the “system prompt”:

   - `CLAUDE.md` for Claude Code “project memory” (auto-loaded). ([Claude API Docs][3])
   - `AGENTS.md` for Codex (auto-loaded). ([OpenAI][4])
   - Optional `opencode.json` per project for OpenCode configuration (not a prompt, but still useful). ([OpenCode][5])
     This is the cleanest way to make the “Takopi supervisor persona” stick across messages without needing Takopi to support first-class system prompts.

3. **Supervisor is a local daemon-ish process** started by the CLI:

   - starts Takopi
   - starts Smithers workflow runner
   - polls workflow health (process + DB heartbeat)
   - posts updates to Telegram on a timer
   - restarts workflow on failure
   - optionally runs an **auto-heal agent pass** on crash, then restarts.

---

## User experience

### Fast path

```bash
# in your repo
bunx takopi-smithers@latest init
bunx takopi-smithers@latest start
```

- If Takopi isn’t configured, `start` will guide you to run Takopi onboarding (`takopi --onboard`) which creates `~/.takopi/takopi.toml`. ([takopi][6])
- `init` scaffolds:

  - `.smithers/workflow.tsx` (starter workflow)
  - `.takopi-smithers/config.toml` (config)
  - `TAKOPI_SMITHERS.md` (the “skill” / operational rules)
  - `CLAUDE.md` and `AGENTS.md` that import/reference `TAKOPI_SMITHERS.md`

### Everyday usage

- Talk to the bot in Telegram to request changes (“add a new phase”, “slow the cron to 30m”, “pause workflow”).
- The agent edits `.smithers/workflow.tsx` or `.takopi-smithers/config.toml`.
- The supervisor watches the workflow file; on change it restarts Smithers to load the new plan.

---

## Architecture

### Processes

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

### Data layout (repo-local)

- `.smithers/`

  - `workflow.tsx` (the plan)
  - `workflow.db` (SQLite persistence; Smithers state survives restarts) ([Smithers][2])

- `.takopi-smithers/config.toml` (supervisor config)
- `TAKOPI_SMITHERS.md` (shared operational instructions)
- `CLAUDE.md` (imports `TAKOPI_SMITHERS.md`) ([Claude API Docs][3])
- `AGENTS.md` (references `TAKOPI_SMITHERS.md`) ([OpenAI][4])

### Smithers workflow expectations we enforce

We rely on (and scaffold) a small set of state keys:

- `supervisor.heartbeat` → ISO timestamp updated every 30s by the workflow process (setInterval in the workflow runner).
- `supervisor.status` → `idle|running|error|done`
- `supervisor.summary` → 1–3 sentence status summary for cron updates
- `supervisor.last_error` → last crash/hang info

Smithers already supports `db.state.set/get` and resuming incomplete executions (`db.execution.findIncomplete()`). ([Smithers][2])
Smithers also encourages DB querying patterns (`SELECT value FROM state WHERE key = ...`). ([Smithers][7])

---

## CLI spec

Binary: `takopi-smithers`

### Commands

- `takopi-smithers init`

  - ensure bun deps (adds `smithers-orchestrator`)
  - scaffold files/templates
  - validate Takopi presence (or print instructions)

- `takopi-smithers start`

  - start Takopi (if not already)
  - start Smithers workflow runner
  - start supervisor loop (cron updates + health + auto-heal)

- `takopi-smithers status`

  - print current workflow status by reading SQLite state keys

- `takopi-smithers restart`

  - restart Smithers workflow runner (gracefully if possible)

- `takopi-smithers stop`

  - stop Smithers runner + Takopi subprocess (optional flag `--keep-takopi`)

- `takopi-smithers doctor`

  - check: bun, git repo, smithers deps, sqlite path writable, takopi config readable, Telegram send test, etc.

### Config file (`.takopi-smithers/config.toml`)

Minimal and opinionated:

```toml
version = 1

[workflow]
script = ".smithers/workflow.tsx"
db = ".smithers/workflow.db"

[updates]
enabled = true
interval_seconds = 600   # 10 minutes default

[health]
heartbeat_key = "supervisor.heartbeat"
heartbeat_write_interval_seconds = 30
hang_threshold_seconds = 300
restart_backoff_seconds = [5, 30, 120, 600]
max_restart_attempts = 20

[telegram]
# if empty, read from ~/.takopi/takopi.toml
bot_token = ""
chat_id = 0

[autoheal]
enabled = true
engine = "claude"  # claude|codex|opencode|pi
max_attempts = 3
```

Takopi’s own config lives at `~/.takopi/takopi.toml` and includes `default_engine`, `transport="telegram"`, and `[transports.telegram] bot_token/chat_id/...`. ([takopi][6])

---

## Supervisor design

### Responsibilities

1. **Start/stop subprocesses**

   - `takopi` subprocess in repo root
   - `bunx smithers-orchestrator .smithers/workflow.tsx` subprocess in repo root ([Smithers][2])

2. **Cron updates**

   - every `interval_seconds`, read `.smithers/workflow.db` state
   - send message to Telegram chat (via bot token)

3. **Health checks**

   - “process exited” → unhealthy
   - “heartbeat stale” (> hang threshold) → unhealthy
   - optional: “no DB file / corrupted” → unhealthy

4. **Auto restart**

   - restart workflow runner with backoff

5. **Auto heal (fix)**

   - On crash/hang, run a repair prompt through the configured engine (default Claude Code), asking it to:

     - inspect logs, workflow file, DB state
     - patch `.smithers/workflow.tsx` (or related files)
     - keep workflow resumable (use `findIncomplete`)

   - then restart workflow runner

### Auto-heal engine adapters (practical plan)

Implement adapters in this order:

1. **Claude Code adapter (default)**

   - Use Claude Code’s non-interactive `-p` mode (Takopi itself uses this pattern). ([takopi][8])
   - Requires user to have Claude Code installed and permissions configured for non-interactive tool usage. ([takopi][8])

2. **Codex adapter**

   - Use `codex exec --json` for structured output; Takopi’s runner docs describe the event stream and success/failure boundaries. ([takopi][9])

3. **OpenCode / Pi**

   - Start as “restart-only + notify” until a stable non-interactive invocation is confirmed.

### Update message format

Keep it skimmable and stable:

- Header: repo name + branch + timestamp
- Status line: running/idle/error
- Summary: from `supervisor.summary` if present, else derived from:

  - last heartbeat
  - last restart attempt
  - last error (truncated)

- “Next action” hint if unhealthy

---

## Codespaces support

Codespaces is a good fit because:

- Takopi polls Telegram outbound; no inbound webhooks required.
- Smithers runs locally inside the codespace.
- You get an always-on environment if you keep the codespace alive.

**Deliverable:** `.devcontainer/devcontainer.json` + `postCreateCommand` that installs:

- bun
- uv + python (Takopi requires python 3.14+ and uv) ([PyPI][1])
- `uv tool install -U takopi` ([takopi][6])
- optionally preinstall agent CLIs via npm global

---

# Pilot implementation plan (hand this to a coding agent)

## Milestone 0 — Repo bootstrap (½ day)

- Create npm package `takopi-smithers`
- Use Bun + TS
- Implement `takopi-smithers --version` + `help`
- Add CI: typecheck, lint, basic unit tests

**Acceptance**

- `bunx takopi-smithers@local --help` works
- Package publishes a runnable bin

## Milestone 1 — `init` scaffolding (1 day)

- `takopi-smithers init`:

  - create `.takopi-smithers/config.toml`
  - create `.smithers/workflow.tsx` template
  - create `TAKOPI_SMITHERS.md`
  - create `CLAUDE.md` importing the above (Claude Code supports memory files + imports) ([Claude API Docs][3])
  - create `AGENTS.md` referencing the above (Codex supports AGENTS.md) ([OpenAI][4])
  - add `smithers-orchestrator` dependency (or prompt user)

- Idempotent behavior (re-run doesn’t trash edits; writes `.bak` or only fills missing)

**Acceptance**

- Fresh repo → `init` produces files and is re-runnable safely.

## Milestone 2 — Supervisor + `start/stop/status/restart` (2 days)

- Implement supervisor in Bun:

  - parse config TOML
  - read takopi config TOML if needed
  - spawn `takopi` subprocess
  - spawn Smithers runner subprocess
  - write/read logs to `.takopi-smithers/logs/*`
  - implement `status` from sqlite state keys (use `bun:sqlite`)
  - implement `restart` (kill + respawn workflow process)
  - implement `stop` (kill children)

- Implement heartbeat:

  - workflow template sets heartbeat on interval in DB using `db.state.set`

- Implement cron updates:

  - send Telegram messages using bot token + chat id
  - include `--dry-run` option for testing

**Acceptance**

- `start` runs both processes
- `status` shows heartbeat + status
- updates post every N minutes

## Milestone 3 — Auto-restart + file-watch reload (1 day)

- File watch `.smithers/workflow.tsx`:

  - debounce changes
  - restart workflow

- Crash restart w/ backoff schedule

**Acceptance**

- Edit workflow file → runner restarts automatically
- Crash → restarts with backoff and notifies

## Milestone 4 — Auto-heal (Claude first) (2–3 days)

- On crash/hang:

  - snapshot context (last N log lines, config, workflow snippet, DB state)
  - run Claude Code `-p` repair prompt
  - restart workflow
  - cap attempts

**Acceptance**

- Introduce a deliberate bug → auto-heal produces a patch and workflow restarts successfully (at least in the common cases).

## Milestone 5 — Codespaces (½–1 day)

- Add `.devcontainer/` config
- Add `docs/codespaces.md`

---

# User documentation artifacts

Below are the **exact files** I recommend you include in the repo.

## `README.md` (proposed)

````md
# takopi-smithers

Run a long-lived Smithers workflow in your repo, and control it from Telegram via Takopi.
Includes a supervisor that posts periodic status updates, restarts on failure, and can auto-heal.

- Takopi: https://takopi.dev
- Smithers: https://smithers.sh

## Who this is for

- Solo devs and small teams
- “I want an agent workflow that runs for hours/days and I can poke from my phone”
- Proof-of-concept friendly

## Requirements

- **bun** installed (we run everything via bunx)
- **git repo** (run from repo root)
- **Python 3.14+ + uv** (Takopi requirement)
  - https://takopi.dev/tutorials/install/
- At least one agent CLI on PATH:
  - Claude Code (`claude`), Codex (`codex`), OpenCode (`opencode`), or Pi (`pi`)

## Install / Run

In your repo:

```bash
bunx takopi-smithers@latest init
bunx takopi-smithers@latest start
```
````

Then open Telegram and message your Takopi bot.

### First message to send

Ask it to write/update the Smithers workflow:

> Create or refine the Smithers workflow in `.smithers/workflow.tsx` to do: <your goal>.
> Keep the workflow resumable and keep `supervisor.summary` up to date.

## What gets created

- `.smithers/workflow.tsx` – the Smithers plan (React/TSX)
- `.smithers/workflow.db` – persisted state (SQLite)
- `.takopi-smithers/config.toml` – supervisor config (cron interval, health thresholds)
- `TAKOPI_SMITHERS.md` – operational rules for the agent
- `CLAUDE.md` and `AGENTS.md` – load the operational rules into Claude Code / Codex

## Commands

```bash
takopi-smithers init
takopi-smithers start
takopi-smithers status
takopi-smithers restart
takopi-smithers stop
takopi-smithers doctor
```

## Configuration

Edit `.takopi-smithers/config.toml`:

- `updates.interval_seconds` – cron interval (default 600)
- `health.hang_threshold_seconds` – treat workflow as stuck if heartbeat is older than this
- `autoheal.enabled` – enable/disable auto-heal

## How it works

- `takopi-smithers start` runs:

  1. `takopi` (Telegram bridge)
  2. `bunx smithers-orchestrator .smithers/workflow.tsx` (your workflow)
  3. supervisor loop (updates + health + restart/heal)

Smithers state persists in SQLite and can resume incomplete executions after restart.

## Codespaces

See `docs/codespaces.md` for a prebuilt devcontainer setup.

## Troubleshooting

- If Takopi says “missing config”, run `takopi --onboard` (interactive TTY required).
- If the agent can’t run tools non-interactively, configure permissions for your engine.
- If updates don’t post, verify `bot_token` and `chat_id` in `~/.takopi/takopi.toml`.

## Security notes

This runs agent CLIs with the ability to read/write files and run commands in your repo.
Only use in trusted repositories and environments.

````

## `TAKOPI_SMITHERS.md` (the “skill” / operational rules)

```md
# takopi-smithers operational rules (load this into your agent context)

You are the Takopi supervisor for this repository.

Your job:
1) Maintain a long-running Smithers workflow in `.smithers/workflow.tsx`
2) Ensure it is resumable across restarts (use Smithers SQLite persistence)
3) Keep status visibility high via DB state keys used by the supervisor:
   - supervisor.status: "idle" | "running" | "error" | "done"
   - supervisor.summary: short human-readable summary (1–3 sentences)
   - supervisor.last_error: most recent failure details
4) When users request changes:
   - Prefer editing `.smithers/workflow.tsx` and/or `.takopi-smithers/config.toml`
   - Expect the runtime to restart the workflow automatically when the file changes

Smithers basics:
- Smithers is a React framework for orchestration. Plans are TSX.
- State is persisted in SQLite and survives restarts.
- You can resume incomplete executions via `db.execution.findIncomplete()`.

Docs:
- Smithers intro: https://smithers.sh/introduction
- MCP/SQLite tool pattern: https://smithers.sh/guides/mcp-integration

Takopi basics:
- Takopi runs your agent CLI in the repo and bridges to Telegram.
- Takopi config lives in ~/.takopi/takopi.toml
- Users can switch engines with /claude, /codex, /opencode, /pi

When workflow crashes or hangs:
- Diagnose using:
  - `.takopi-smithers/logs/*`
  - `.smithers/workflow.tsx`
  - SQLite state keys and execution history
- Patch the workflow to prevent recurrence (timeouts, retries, smaller steps)
- Keep the plan simple and observable (Phases/Steps/Tasks), and update supervisor.summary often.

Output style:
- Be explicit about what changed and why.
- Prefer robust, restart-friendly designs over cleverness.
````

## `CLAUDE.md` (loads operational rules into Claude Code)

```md
# Project memory (Claude Code)

@TAKOPI_SMITHERS.md

Additional notes:

- Workflow file: .smithers/workflow.tsx
- Supervisor config: .takopi-smithers/config.toml
```

(Claude Code loads memory files automatically and supports `@path` imports.) ([Claude API Docs][3])

## `AGENTS.md` (loads operational rules into Codex)

```md
# takopi-smithers instructions for Codex

Read and follow: TAKOPI_SMITHERS.md

Key paths:

- .smithers/workflow.tsx
- .takopi-smithers/config.toml
```

(OpenAI documents AGENTS.md behavior/spec.) ([OpenAI][4])

## `docs/architecture.md`

- process model
- state keys contract
- restart + backoff strategy
- how cron updates are produced

## `docs/codespaces.md`

- devcontainer setup
- how to keep the process alive
- expected caveats (secrets, auth flows)

## `docs/troubleshooting.md`

- common failures: takopi lockfile, missing token, engine not installed, permissions blocking, sqlite locked

---

# Implementation notes the coding agent will need

## 1) Reuse Takopi config when possible

Takopi’s config is TOML and includes telegram bot token + chat id under `[transports.telegram]`. ([takopi][10])
Implement: “if `.takopi-smithers/config.toml` doesn’t specify token/chat, read them from `~/.takopi/takopi.toml`.”

## 2) Smithers runner invocation

Smithers docs show typical workflow code and the `bunx smithers-orchestrator <script>` execution pattern. ([Smithers][2])

## 3) SQLite querying

Smithers encourages storing state in SQLite and querying `state` via SQL (examples use `SELECT value FROM state WHERE key = ...`). ([Smithers][7])
So the supervisor should treat `state` as the stable integration surface (avoid depending on internal “frames” schema until documented).

## 4) Non-interactive engine constraints

Claude Code and Codex have non-interactive modes used by Takopi runners; if tool approvals are required, non-interactive runs can block/fail unless permissions are preconfigured. ([takopi][8])

---

If you want one additional “high expectation” feature for v1.1 that’s still tractable: **“topic = branch” in Telegram** (Takopi workspace mode) and **one Smithers workflow per worktree**, but keep that out of the pilot until the single-workflow lifecycle is solid. ([PyPI][1])

[1]: https://pypi.org/project/takopi/ "https://pypi.org/project/takopi/"
[2]: https://smithers.sh/ "https://smithers.sh/"
[3]: https://docs.claude.com/en/docs/claude-code/memory "https://docs.claude.com/en/docs/claude-code/memory"
[4]: https://openai.com/index/introducing-codex/ "https://openai.com/index/introducing-codex/"
[5]: https://opencode.ai/docs/config "https://opencode.ai/docs/config"
[6]: https://takopi.dev/tutorials/install/ "https://takopi.dev/tutorials/install/"
[7]: https://smithers.sh/components/task "https://smithers.sh/components/task"
[8]: https://takopi.dev/reference/runners/claude/runner/ "https://takopi.dev/reference/runners/claude/runner/"
[9]: https://takopi.dev/reference/runners/codex/exec-json-cheatsheet/?utm_source=chatgpt.com "Codex exec --json event cheatsheet - takopi"
[10]: https://takopi.dev/reference/config/ "https://takopi.dev/reference/config/"
