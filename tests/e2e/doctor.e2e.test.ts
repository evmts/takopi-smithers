import { test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'node:path';
import { createTestRepo, type TestRepo } from './setup';

let testRepo: TestRepo;

beforeAll(async () => {
  testRepo = await createTestRepo();
  // Run init first
  const initProc = Bun.spawn(['bun', 'run', join(process.cwd(), 'src/cli.ts'), 'init'], {
    cwd: testRepo.path,
    env: process.env,
  });
  await initProc.exited;
});

afterAll(() => {
  testRepo.cleanup();
});

test('e2e: doctor command runs all checks', async () => {
  const proc = Bun.spawn(
    ['bun', 'run', join(process.cwd(), 'src/cli.ts'), 'doctor'],
    {
      cwd: testRepo.path,
      env: process.env,
      stdout: 'pipe',
    }
  );

  const stdout = await new Response(proc.stdout).text();
  await proc.exited;

  // Should check Bun, git, config, etc.
  expect(stdout).toContain('Bun Installation');
  expect(stdout).toContain('Git Repository');
  expect(stdout).toContain('Config File');
});
