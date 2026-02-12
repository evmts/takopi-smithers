# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2024-02-12

### Added
- Initial release of takopi-smithers
- CLI commands: init, start, stop, restart, status, logs, doctor
- Supervisor with health monitoring and periodic Telegram updates
- Auto-restart with exponential backoff
- File-watch reload for workflow changes
- Auto-heal system with 4 engine adapters:
  - Claude Code (default)
  - Codex (OpenAI)
  - OpenCode
  - Pi (Inflection AI)
- Git worktree support for parallel branch workflows
- Telegram topics integration via message_thread_id
- GitHub Codespaces support with devcontainer config
- Comprehensive documentation:
  - Architecture guide
  - Codespaces setup guide
  - Troubleshooting guide
  - Worktrees guide
- CI/CD pipeline with GitHub Actions
- Full test suite (unit + e2e + integration)

### Documentation
- README with quick start and configuration guide
- TAKOPI_SMITHERS.md operational rules for agents
- Auto-generated CLAUDE.md and AGENTS.md for agent context
- Complete API documentation in docs/

### Infrastructure
- Bun-based build system
- TypeScript with strict mode
- ESLint configuration
- GitHub Actions for CI and npm publishing

[Unreleased]: https://github.com/williamcory/takopi-smithers/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/williamcory/takopi-smithers/releases/tag/v1.0.0
