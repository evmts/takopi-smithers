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

test('e2e: status command handles missing DB gracefully', async () => {
  const proc = Bun.spawn(
    ['bun', 'run', join(process.cwd(), 'src/cli.ts'), 'status'],
    {
      cwd: testRepo.path,
      env: process.env,
      stdout: 'pipe',
    }
  );

  const stdout = await new Response(proc.stdout).text();
  await proc.exited;

  // Should either show status or indicate workflow hasn't run yet
  expect(proc.exitCode).toBe(0);
  expect(stdout.length).toBeGreaterThan(0);
});

test('e2e: status command with --json flag', async () => {
  const proc = Bun.spawn(
    ['bun', 'run', join(process.cwd(), 'src/cli.ts'), 'status', '--json'],
    {
      cwd: testRepo.path,
      env: process.env,
      stdout: 'pipe',
    }
  );

  const stdout = await new Response(proc.stdout).text();
  await proc.exited;

  expect(proc.exitCode).toBe(0);

  // Should output valid JSON
  expect(() => JSON.parse(stdout)).not.toThrow();
});
