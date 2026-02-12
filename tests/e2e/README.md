# End-to-End Tests

These tests validate the full user workflow in isolated test environments.

## Running E2E tests

```bash
# Run all E2E tests
bun test:e2e

# Run specific E2E test
bun test tests/e2e/init.e2e.test.ts
```

## Test structure

- `setup.ts` - Test infrastructure (creates temporary git repos)
- `init.e2e.test.ts` - Tests `init` command workflow
- `doctor.e2e.test.ts` - Tests `doctor` command diagnostics
- `status.e2e.test.ts` - Tests `status` command output

## Adding new E2E tests

1. Create `tests/e2e/your-feature.e2e.test.ts`
2. Use `createTestRepo()` from `setup.ts` to get a clean test environment
3. Run CLI commands via `Bun.spawn()` with the test repo as cwd
4. Verify expected outcomes (files created, exit codes, stdout content)
5. Always cleanup with `testRepo.cleanup()` in `afterAll()`

## Test environments

Each test gets a fresh temporary directory with:
- Initialized git repository
- Basic package.json
- User configured for git commits

Tests are fully isolated and run in parallel.

## What we test

1. **init.e2e.test.ts** - Scaffolding workflow
   - Creates all required files
   - Idempotent behavior (safe to run multiple times)

2. **doctor.e2e.test.ts** - System diagnostics
   - Runs all health checks
   - Detects configuration issues

3. **status.e2e.test.ts** - Status reporting
   - Handles missing workflow DB gracefully
   - JSON output format validation

## Dependencies

No additional dependencies needed - uses Bun's built-in test runner and file system APIs.

## Success criteria

- All E2E tests pass on CI
- Tests run in isolated environments (no side effects)
- Tests are fast (<10s total)
- Tests validate real user workflows
