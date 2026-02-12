# takopi-smithers

[![npm version](https://badge.fury.io/js/takopi-smithers.svg)](https://www.npmjs.com/package/takopi-smithers)
[![CI](https://github.com/evmts/takopi-smithers/actions/workflows/ci.yml/badge.svg)](https://github.com/evmts/takopi-smithers/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Run a long-lived Smithers workflow in your repo, and control it from Telegram via Takopi.
Includes a supervisor that posts periodic status updates, restarts on failure, and can auto-heal.

- Takopi: https://takopi.dev
- Smithers: https://smithers.sh

<img width="256" height="384" alt="image" src="https://github.com/user-attachments/assets/c7d20c08-9bff-449a-9eb7-3875703d3539" />

## Who this is for

- Solo devs and small teams
- "I want an agent workflow that runs for hours/days and I can poke from my phone"
- Proof-of-concept friendly

## Full Setup (step by step)

### Step 1: Install prerequisites

You need all of these before anything will work:

```bash
# Bun (runtime)
curl -fsSL https://bun.sh/install | bash

# Python 3.14+ and uv (Takopi needs these)
# macOS:
brew install python uv
# or see https://takopi.dev/tutorials/install/

# At least one agent CLI:
# Claude Code (recommended): https://docs.anthropic.com/en/docs/claude-code
# Codex: npm i -g @openai/codex
# OpenCode: go install github.com/opencode-ai/opencode@latest
# Pi: cargo install pi-cli
```

### Step 2: Create a Telegram bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Pick a name and username for your bot
4. BotFather gives you a **bot token** like `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11` -- save it

### Step 3: Get your chat ID

1. Message your new bot in Telegram (send anything, e.g. "hello")
2. Open this URL in your browser (replace `YOUR_BOT_TOKEN`):
   ```
   https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
   ```
3. Find `"chat":{"id":XXXXXXX}` in the JSON response -- that number is your **chat ID**

### Step 4: Onboard Takopi

```bash
pip install takopi
takopi --onboard
```

This creates `~/.takopi/takopi.toml` with your Telegram credentials. The onboarding wizard will ask for your bot token and chat ID from steps 2-3.

### Step 5: Initialize your repo

```bash
cd your-repo
bunx takopi-smithers init
```

This creates:
- `.smithers/workflow.tsx` -- the Smithers workflow (plan/implement/review/fix loop)
- `.takopi-smithers/config.toml` -- supervisor configuration
- `TAKOPI_SMITHERS.md` -- operational rules for the agent
- Updates to `CLAUDE.md` and `AGENTS.md`

### Step 6: Configure Telegram credentials

Edit `.takopi-smithers/config.toml` and fill in your bot token and chat ID:

```toml
[telegram]
bot_token = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
chat_id = 123456789
```

Or, if you already ran `takopi --onboard`, the supervisor will fall back to reading `~/.takopi/takopi.toml` automatically.

### Step 7: (Optional) Set workflow input

If your workflow needs input (e.g. a spec file path), uncomment and set the input field:

```toml
[workflow]
script = ".smithers/workflow.tsx"
db = ".smithers/workflow.db"
input = { specPath = "SPEC.md" }
```

This gets passed as `--input '{"specPath":"SPEC.md"}'` to `smithers run` and is available as `ctx.input.specPath` in your workflow.

### Step 8: Verify everything works

```bash
bunx takopi-smithers doctor
```

This checks: Bun, git repo, smithers dependencies, config validity, SQLite write access, takopi config, and Telegram connectivity (sends a test message to your bot).

Fix anything that shows `❌` or `⚠️` before proceeding.

### Step 9: Start

```bash
bunx takopi-smithers start
```

This launches three things:
1. **Takopi** -- Telegram bridge (lets you message the agent from your phone)
2. **Smithers** -- your workflow (`smithers run .smithers/workflow.tsx`)
3. **Supervisor** -- monitors health, posts status updates every 10min, auto-restarts on crash

Open Telegram and message your bot. The supervisor will post periodic status updates automatically.

### First message to send

Ask it to write/update the Smithers workflow:

> Create or refine the Smithers workflow in `.smithers/workflow.tsx` to do: <your goal>.
> Keep the workflow resumable and keep `supervisor.summary` up to date.

## Commands

```bash
takopi-smithers init                # Scaffold config + workflow + agent instructions
takopi-smithers start               # Start supervisor (takopi + smithers + health monitor)
takopi-smithers start --dry-run     # Start without launching takopi (for testing)
takopi-smithers status              # Show workflow state from SQLite
takopi-smithers status --json       # Machine-readable status output
takopi-smithers restart             # Restart the smithers workflow (keeps takopi running)
takopi-smithers stop                # Stop everything
takopi-smithers stop --keep-takopi  # Stop workflow but keep Takopi running
takopi-smithers logs                # View supervisor logs
takopi-smithers logs --follow       # Tail logs in real-time
takopi-smithers logs --level error  # Show only errors
takopi-smithers logs --lines 50     # Show last 50 lines
takopi-smithers doctor              # Run diagnostics and verify setup
```

## Configuration

`.takopi-smithers/config.toml`:

```toml
version = 1

[workflow]
script = ".smithers/workflow.tsx"
db = ".smithers/workflow.db"
# input = { specPath = "SPEC.md" }    # passed as --input JSON to smithers

[updates]
enabled = true
interval_seconds = 600               # post status to Telegram every 10 min

[health]
heartbeat_key = "supervisor.heartbeat"
heartbeat_write_interval_seconds = 30
hang_threshold_seconds = 300          # kill workflow if heartbeat stale >5min
restart_backoff_seconds = [5, 30, 120, 600]
max_restart_attempts = 20

[telegram]
bot_token = ""                        # from BotFather
chat_id = 0                           # from getUpdates API
# message_thread_id = 0              # for Telegram topics/threads

[autoheal]
enabled = true
engine = "claude"                     # "claude", "codex", "opencode", or "pi"
max_attempts = 3
```

## How it works

```
┌─────────────────────────────────────────────────────┐
│  takopi-smithers start                               │
│                                                      │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Takopi   │  │   Smithers   │  │  Supervisor   │  │
│  │ (Telegram │  │  (workflow   │  │ (health +     │  │
│  │  bridge)  │  │   runner)    │  │  updates +    │  │
│  │           │  │              │  │  auto-heal)   │  │
│  └──────────┘  └──────────────┘  └───────────────┘  │
│       │               │                │             │
│       │          .smithers/            │             │
│       │          workflow.db      reads heartbeat    │
│       │          (SQLite)         from SQLite        │
│       │               │                │             │
│       └───────── Telegram ─────────────┘             │
│              (status updates + commands)              │
└─────────────────────────────────────────────────────┘
```

The supervisor:
- Polls `supervisor.heartbeat` in the SQLite DB every 10s
- Kills and restarts the workflow if heartbeat goes stale
- Posts formatted status updates to Telegram on a timer
- **Watches `.smithers/workflow.tsx` for file changes and auto-restarts** (with 1 second debounce)
- On crash, optionally runs an auto-heal agent pass before restarting

### Auto-Reload on File Changes

The supervisor automatically watches your workflow file (`.smithers/workflow.tsx`) for changes. When you edit and save the file:

1. **Debounce**: Changes are debounced with a 1-second delay (rapid successive saves only trigger one restart)
2. **Graceful Restart**: The current Smithers process is killed gracefully and a new one starts
3. **Counter Reset**: Restart attempt counters are reset (file changes are intentional, not crashes)
4. **Telegram Notification**: You'll receive a notification that the workflow was reloaded
5. **Error Handling**: If the file is deleted or has syntax errors, the supervisor logs the error and continues running

This makes iterative workflow development seamless - just save your changes and the supervisor handles the rest.

Smithers state persists in SQLite and can resume incomplete executions after restart.

## Worktree Support

Run independent workflows per git branch. Each worktree gets its own config, DB, workflow, and logs.

```bash
git worktree add ../myrepo-feature feature-branch
cd ../myrepo-feature
takopi-smithers init --worktree feature
takopi-smithers start --worktree feature
```

### Managing Multiple Worktrees

When you have multiple worktrees configured, you can manage them all at once using the `--all-worktrees` flag:

```bash
# Start supervisors for all configured worktrees
takopi-smithers start --all-worktrees

# View status of all worktrees in a table
takopi-smithers status --all-worktrees

# Restart all running supervisors
takopi-smithers restart --all-worktrees

# Stop all supervisors
takopi-smithers stop --all-worktrees
```

**How it works:**
- `start --all-worktrees` spawns a separate supervisor process for each worktree that has a config file
- `status --all-worktrees` shows a formatted table with branch name, status, heartbeat age, and summary
- `restart --all-worktrees` sends restart signals to all running supervisors
- `stop --all-worktrees` gracefully stops all supervisors

**Note:** The `--all-worktrees` flag is mutually exclusive with `--worktree <name>` - you can't use both together.

See `docs/worktrees.md` for detailed setup.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `takopi: command not found` | `pip install takopi` |
| `takopi --onboard` hangs | Needs an interactive terminal (not inside an agent) |
| No Telegram messages | Run `takopi-smithers doctor` to test connectivity |
| `ENOENT .takopi-smithers/config.toml` | Run `takopi-smithers init` first |
| Bot doesn't respond to messages | Make sure you messaged the bot first, then check `getUpdates` |
| Workflow crashes in loop | Check `takopi-smithers logs --level error`, reduce `max_restart_attempts` |
| Heartbeat always stale | Your workflow must write `supervisor.heartbeat` to the state table every 30s |
| Auto-heal keeps failing | Check that your agent CLI (`claude`, `codex`, etc.) is on PATH and works non-interactively |

See `docs/troubleshooting.md` for more.

## Codespaces

See `docs/codespaces.md` for a prebuilt devcontainer setup.

## Workflow Templates

When you run `takopi-smithers init`, you can choose from several workflow templates:

1. **Default** (recommended) - Plan/Implement/Review/Fix loop
   - General-purpose workflow for spec-driven development
   - Iterative loop with quality gates
   - Best for: Most projects, following a spec document

2. **API Builder** - Build REST API endpoints with tests
   - Sequential pipeline: research → scaffold → implement → validate
   - Idempotent task design (safe to restart)
   - Best for: Building REST APIs, microservices

3. **Refactoring** - Systematic codebase refactoring
   - Progressive refactoring with rollback support
   - Module-by-module approach with validation gates
   - Best for: Large-scale refactoring, technical debt reduction

4. **Feature Implementation** - Multi-step feature with validation
   - Gated progression (must pass tests before next phase)
   - Separates core logic, UI, integration, and docs
   - Best for: New features requiring comprehensive testing

5. **Minimal** - Basic scaffold to build from scratch
   - Clean slate with just supervisor state and one task
   - Best for: Custom workflows, learning Smithers

To specify a template:

```bash
# Interactive prompt (default)
bunx takopi-smithers init

# Non-interactive with specific template
bunx takopi-smithers init --template api-builder
bunx takopi-smithers init --template refactor
bunx takopi-smithers init --template feature
bunx takopi-smithers init --template minimal
```

All templates include:
- ✅ Supervisor state management (status, summary, heartbeat)
- ✅ Error handling and graceful degradation
- ✅ Resumability across restarts
- ✅ Production-ready patterns

See `examples/workflows/` for the full source code of each template.

## Authoring Custom Workflows

See `docs/workflow-authoring.md` for a complete guide to writing production-ready workflows, including:

- Schema design best practices
- State key contract requirements
- Error handling patterns
- Resumability patterns
- Testing workflows locally
- Common pitfalls and solutions

Quick example:

```tsx
import { smithers, Workflow, Task, ClaudeCodeAgent } from "smithers-orchestrator";
import { drizzle } from "drizzle-orm/bun-sqlite";

// 1. Define schema
const schema = { /* your tables */ };
const db = drizzle(".smithers/workflow.db", { schema });

// 2. Update supervisor state
function updateState(key: string, value: string) { /* ... */ }
updateState("supervisor.status", "running");
updateState("supervisor.heartbeat", new Date().toISOString());

// 3. Create agents
const agent = new ClaudeCodeAgent({ model: "sonnet", env: { ANTHROPIC_API_KEY: "" } });

// 4. Define workflow
export default smithers(db, (ctx) => (
  <Workflow name="my-workflow">
    <Task id="my-task" output={schema.output} agent={agent}>
      Your prompt here
    </Task>
  </Workflow>
));
```

## Testing

```bash
bun run test           # Unit tests
bun run test:e2e       # E2E tests
bun run test:all       # Unit + E2E
bun run test:ci        # Full CI pipeline (typecheck + lint + all tests)
```

## Development

```bash
# Link for local testing
bun link
cd another-project && bun link takopi-smithers

# Build
bun run build

# Test the built package
bun run test:package
```

## Security notes

This runs agent CLIs with the ability to read/write files and run commands in your repo.
Only use in trusted repositories and environments.
