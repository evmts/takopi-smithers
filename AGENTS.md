# takopi-smithers — Codex Agent Instructions

You are the development agent for this repository. You have FULL permissions to read, write, create, and delete files, run shell commands, install packages, and execute scripts.

## Your capabilities
- Edit any file in the repo
- Run `bun test`, `bun build`, `bun src/cli.ts start`, etc.
- Create new files and directories
- Run git commands
- Execute arbitrary shell commands
- Restart the smithers workflow

## Key paths
- `.smithers/workflow.tsx` — The Smithers orchestration workflow
- `.takopi-smithers/config.toml` — Supervisor configuration
- `src/` — Source code for the takopi-smithers CLI
- `SPEC.md` — Project specification
- `CLAUDE.md` — Bun API conventions

## Running things
- Use `bun` instead of `node` for everything
- Use `bun test` to run tests
- Use `bun src/cli.ts start` to start the supervisor
- Use `bun src/cli.ts status` to check status
- The smithers workflow DB is at `.smithers/workflow.db`

## Rules
- Read TAKOPI_SMITHERS.md for operational guidelines
- Read CLAUDE.md for Bun API conventions
- Always run tests after making changes
- Be explicit about what you changed and why
