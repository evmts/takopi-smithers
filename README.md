# takopi-smithers

[![npm version](https://badge.fury.io/js/takopi-smithers.svg)](https://www.npmjs.com/package/takopi-smithers)
[![CI](https://github.com/williamcory/takopi-smithers/actions/workflows/ci.yml/badge.svg)](https://github.com/williamcory/takopi-smithers/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Run a long-lived Smithers workflow in your repo, and control it from Telegram via Takopi.
Includes a supervisor that posts periodic status updates, restarts on failure, and can auto-heal.

- Takopi: https://takopi.dev
- Smithers: https://smithers.sh

## Who this is for

- Solo devs and small teams
- "I want an agent workflow that runs for hours/days and I can poke from my phone"
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
takopi-smithers stop                # Stop everything
takopi-smithers stop --keep-takopi  # Stop workflow but keep Takopi running
takopi-smithers logs                # View supervisor logs
takopi-smithers logs --follow       # Tail logs in real-time
takopi-smithers logs --level error  # Show only errors
takopi-smithers doctor
```

## Configuration

Edit `.takopi-smithers/config.toml`:

- `updates.interval_seconds` – cron interval (default 600)
- `health.hang_threshold_seconds` – treat workflow as stuck if heartbeat is older than this
- `autoheal.enabled` – enable/disable auto-heal
- `autoheal.engine` – which agent to use for auto-heal: `"claude"` (default), `"codex"`, `"opencode"`, or `"pi"`
- `autoheal.max_attempts` – how many auto-heal attempts before giving up (default 3)

## Worktree Support

takopi-smithers supports running independent workflows for different git branches using git worktrees.
Each worktree gets its own config, workflow, database, and can post to separate Telegram threads.

See `docs/worktrees.md` for detailed setup.

Quick example:
```bash
git worktree add ../myrepo-feature feature-branch
cd ../myrepo-feature
takopi-smithers init
takopi-smithers start
```

## How it works

- `takopi-smithers start` runs:

  1. `takopi` (Telegram bridge)
  2. `bunx smithers-orchestrator .smithers/workflow.tsx` (your workflow)
  3. supervisor loop (updates + health + restart/heal)

Smithers state persists in SQLite and can resume incomplete executions after restart.

## Codespaces

See `docs/codespaces.md` for a prebuilt devcontainer setup.

## Example Workflows

See `examples/workflows/` for sample Smithers workflow templates.

## Troubleshooting

- If Takopi says "missing config", run `takopi --onboard` (interactive TTY required).
- If the agent can't run tools non-interactively, configure permissions for your engine.
- If updates don't post, verify `bot_token` and `chat_id` in `~/.takopi/takopi.toml`.

## Testing

### Run all tests
```bash
bun run test:all
```

### Run specific test suites
```bash
bun run test           # Unit tests only
bun run test:e2e       # E2E tests only
bun run test:e2e:full  # Full workflow E2E test
bun run test:integration  # Integration tests
bun run test:manual    # Manual end-to-end validation
```

### CI Pipeline
```bash
bun run test:ci        # Run full CI pipeline locally
```

All tests run automatically on push via GitHub Actions.

## Development

### Local Development

```bash
# Link for local testing
bun link

# In another project
bun link takopi-smithers
bunx takopi-smithers --help
```

### Building

```bash
bun run build
```

### Testing the Package Locally

```bash
bun run test:package
```

### Publishing

Publishing is automated via GitHub Actions:

1. Update version: `bun version patch` (or `minor`, `major`)
2. Push with tags: `git push --follow-tags`
3. GitHub Actions will automatically build and publish to npm

Manual publish (for maintainers):
```bash
bun run build
npm publish --access public
```

## Security notes

This runs agent CLIs with the ability to read/write files and run commands in your repo.
Only use in trusted repositories and environments.
