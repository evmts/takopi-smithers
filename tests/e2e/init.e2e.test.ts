import { test, expect, beforeAll, afterAll } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTestRepo, type TestRepo } from './setup';

let testRepo: TestRepo;

beforeAll(async () => {
  testRepo = await createTestRepo();
});

afterAll(() => {
  testRepo.cleanup();
});

test('e2e: init command creates all required files', async () => {
  // Run init command in test repo
  const proc = Bun.spawn(
    ['bun', 'run', join(process.cwd(), 'src/cli.ts'), 'init'],
    { cwd: testRepo.path, env: process.env }
  );

  await proc.exited;
  expect(proc.exitCode).toBe(0);

  // Verify all scaffolded files exist
  const expectedFiles = [
    '.takopi-smithers/config.toml',
    '.smithers/workflow.tsx',
    'TAKOPI_SMITHERS.md',
    'CLAUDE.md',
    'AGENTS.md',
  ];

  for (const file of expectedFiles) {
    const filePath = join(testRepo.path, file);
    expect(existsSync(filePath)).toBe(true);
  }
});

test('e2e: init is idempotent', async () => {
  // Run init twice
  const proc1 = Bun.spawn(['bun', 'run', join(process.cwd(), 'src/cli.ts'), 'init'], {
    cwd: testRepo.path,
    env: process.env,
  });
  await proc1.exited;

  const proc2 = Bun.spawn(['bun', 'run', join(process.cwd(), 'src/cli.ts'), 'init'], {
    cwd: testRepo.path,
    env: process.env,
  });
  await proc2.exited;

  // Both should succeed
  expect(proc1.exitCode).toBe(0);
  expect(proc2.exitCode).toBe(0);
});
