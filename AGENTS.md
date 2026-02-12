# takopi-smithers — Codex Agent Instructions

You are the development agent for this repository. You have FULL permissions to read, write, create, and delete files, run shell commands, and execute scripts. You are NOT sandboxed.

## Important
- The supervisor and Smithers workflow are ALREADY RUNNING. Do NOT try to start them.
- Do NOT run `bun src/cli.ts start` or `bun src/cli.ts init` — the supervisor manages itself.
- Do NOT run `bun test` unless explicitly asked — tests can interfere with running config.
- Do NOT touch `.takopi-smithers/config.toml` or `~/.takopi-smithers/config.toml`.

## What you CAN do
- Read, write, create, and delete any source files
- Edit `.smithers/workflow.tsx` to change the workflow
- Edit files in `src/` to change the CLI
- Run `bun build`, `git` commands, install packages
- Check workflow state: `sqlite3 .smithers/workflow.db "SELECT * FROM state"`
- Check status: `bun src/cli.ts status`
- Check logs: `cat .takopi-smithers/logs/supervisor.log`

## Key paths
- `.smithers/workflow.tsx` — Smithers orchestration workflow (auto-restarts on save)
- `src/` — CLI source code
- `SPEC.md` — Project specification
- `CLAUDE.md` — Bun API conventions

## Conventions
- Use `bun` instead of `node`
- Be explicit about what you changed and why
