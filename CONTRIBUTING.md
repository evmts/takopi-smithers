# Contributing to takopi-smithers

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites
- [Bun](https://bun.sh) v1.1.0 or later
- Git
- Node.js 18+ (for npm publishing only)

### Getting Started

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/takopi-smithers.git
   cd takopi-smithers
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Run tests:
   ```bash
   bun test
   ```

4. Build the project:
   ```bash
   bun run build
   ```

## Project Structure

```
src/
├── cli.ts              # Main CLI entry point
├── commands/           # CLI command implementations
│   ├── init.ts
│   ├── start.ts
│   ├── stop.ts
│   ├── status.ts
│   ├── restart.ts
│   ├── logs.ts
│   └── doctor.ts
├── lib/                # Core library code
│   ├── supervisor.ts   # Main supervisor logic
│   ├── autoheal.ts     # Auto-heal orchestration
│   ├── adapters/       # Engine adapters (claude, codex, etc.)
│   ├── config.ts       # TOML config parsing
│   ├── db.ts           # SQLite state queries
│   ├── telegram.ts     # Telegram API client
│   └── worktree.ts     # Git worktree support
tests/
├── e2e/                # End-to-end tests
└── fixtures/           # Test fixtures
docs/                   # Documentation
```

## Development Workflow

### Running in Development

```bash
# Watch mode for CLI changes
bun run dev

# Run specific command
bun src/cli.ts --help
```

### Testing

```bash
# Unit tests
bun test src

# E2E tests
bun test tests/e2e

# All tests
bun run test:all

# Integration tests (requires setup)
RUN_INTEGRATION=1 bun test src/integration.test.ts

# Typecheck
bun run typecheck

# Lint
bun run lint
bun run lint:fix  # Auto-fix issues
```

### Code Style

- Use TypeScript with strict mode
- Follow ESLint rules (run `bun run lint`)
- Prefer Bun APIs over Node.js equivalents (see CLAUDE.md)
- Add tests for new features
- Update documentation when changing behavior

## Adding a New Command

1. Create `src/commands/mycommand.ts`:
   ```typescript
   export async function mycommand(options: MyOptions = {}): Promise<void> {
     // Implementation
   }
   ```

2. Add tests in `src/commands/mycommand.test.ts`

3. Wire it up in `src/cli.ts`

4. Update help text in `src/commands/help.ts`

5. Add documentation in `README.md` and relevant docs/

## Adding a New Auto-Heal Engine

1. Create `src/lib/adapters/myengine.ts` implementing `AutoHealAdapter` interface

2. Add tests in `src/lib/adapters/myengine.test.ts`

3. Register in `src/lib/adapters/index.ts`

4. Update `config.toml` schema to include new engine option

5. Document in `docs/architecture.md` and `README.md`

## Submitting Changes

### Pull Request Process

1. Create a feature branch:
   ```bash
   git checkout -b feature/my-feature
   ```

2. Make your changes and commit:
   ```bash
   git add .
   git commit -m "feat: add my feature"
   ```

   Use [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation
   - `test:` for test changes
   - `refactor:` for code refactoring
   - `chore:` for maintenance tasks

3. Push and create a PR:
   ```bash
   git push origin feature/my-feature
   ```

4. Ensure CI passes:
   - All tests must pass
   - Linting must pass
   - Typecheck must pass

### PR Guidelines

- Write clear, descriptive PR titles
- Reference related issues with `Fixes #123`
- Add tests for new features
- Update CHANGELOG.md in the `[Unreleased]` section
- Keep PRs focused and reasonably sized

## Release Process

(Maintainers only)

1. Update version in `package.json`
2. Update `CHANGELOG.md` (move Unreleased to new version)
3. Commit: `git commit -m "chore: release v1.x.x"`
4. Tag: `git tag v1.x.x`
5. Push: `git push origin main --tags`
6. GitHub Actions will automatically publish to npm

## Getting Help

- Open an issue for bugs or feature requests
- Check existing issues and discussions first
- Be respectful and constructive

## Code of Conduct

Be kind, respectful, and considerate. We're all here to learn and build something useful.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
