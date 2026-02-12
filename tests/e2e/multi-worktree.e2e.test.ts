import { test, expect, beforeAll, afterAll, describe } from 'bun:test';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

interface TestMultiWorktreeRepo {
  path: string;
  worktrees: Array<{ name: string; path: string }>;
  cleanup: () => void;
}

async function createMultiWorktreeRepo(): Promise<TestMultiWorktreeRepo> {
  const testPath = join(tmpdir(), `takopi-smithers-multi-test-${Date.now()}`);

  // Create main directory
  mkdirSync(testPath, { recursive: true });

  // Initialize git repo
  await Bun.$`git init`.cwd(testPath).quiet();
  await Bun.$`git config user.email "test@example.com"`.cwd(testPath).quiet();
  await Bun.$`git config user.name "Test User"`.cwd(testPath).quiet();

  // Create initial commit
  writeFileSync(join(testPath, 'README.md'), '# Test Repo');
  await Bun.$`git add .`.cwd(testPath).quiet();
  await Bun.$`git commit -m "Initial commit"`.cwd(testPath).quiet();

  // Create worktrees
  const worktrees = [
    { name: 'feature-1', path: join(testPath, '../worktree-feature-1') },
    { name: 'feature-2', path: join(testPath, '../worktree-feature-2') },
  ];

  for (const wt of worktrees) {
    await Bun.$`git worktree add -b ${wt.name} ${wt.path}`.cwd(testPath).quiet();
  }

  return {
    path: testPath,
    worktrees,
    cleanup: () => {
      // Remove worktrees first
      for (const wt of worktrees) {
        try {
          rmSync(wt.path, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
      rmSync(testPath, { recursive: true, force: true });
    },
  };
}

describe('Multi-worktree E2E tests', () => {
  let testRepo: TestMultiWorktreeRepo;

  beforeAll(async () => {
    testRepo = await createMultiWorktreeRepo();

    // Initialize main worktree
    const initMainProc = Bun.spawn(
      ['bun', 'run', join(process.cwd(), 'src/cli.ts'), 'init'],
      {
        cwd: testRepo.path,
        env: process.env,
      }
    );
    await initMainProc.exited;

    // Initialize each worktree
    for (const wt of testRepo.worktrees) {
      const initProc = Bun.spawn(
        ['bun', 'run', join(process.cwd(), 'src/cli.ts'), 'init', '--worktree', wt.name],
        {
          cwd: testRepo.path,
          env: process.env,
        }
      );
      await initProc.exited;
    }
  });

  afterAll(() => {
    testRepo.cleanup();
  });

  test('e2e: status --all-worktrees shows all configured worktrees', async () => {
    const proc = Bun.spawn(
      ['bun', 'run', join(process.cwd(), 'src/cli.ts'), 'status', '--all-worktrees'],
      {
        cwd: testRepo.path,
        env: process.env,
        stdout: 'pipe',
      }
    );

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain('All Worktrees');
    // Should show at least the worktrees we created
    expect(stdout.length).toBeGreaterThan(0);
  });

  test('e2e: status --all-worktrees --json outputs valid JSON', async () => {
    const proc = Bun.spawn(
      ['bun', 'run', join(process.cwd(), 'src/cli.ts'), 'status', '--all-worktrees', '--json'],
      {
        cwd: testRepo.path,
        env: process.env,
        stdout: 'pipe',
      }
    );

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    expect(proc.exitCode).toBe(0);

    // Should output valid JSON array
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  test('e2e: stop --all-worktrees handles no running supervisors gracefully', async () => {
    const proc = Bun.spawn(
      ['bun', 'run', join(process.cwd(), 'src/cli.ts'), 'stop', '--all-worktrees'],
      {
        cwd: testRepo.path,
        env: process.env,
        stdout: 'pipe',
      }
    );

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain('No running supervisors');
  });

  test('e2e: restart --all-worktrees handles no running supervisors gracefully', async () => {
    const proc = Bun.spawn(
      ['bun', 'run', join(process.cwd(), 'src/cli.ts'), 'restart', '--all-worktrees'],
      {
        cwd: testRepo.path,
        env: process.env,
        stdout: 'pipe',
      }
    );

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain('No running supervisors');
  });

  test('e2e: cannot use --worktree and --all-worktrees together', async () => {
    const proc = Bun.spawn(
      ['bun', 'run', join(process.cwd(), 'src/cli.ts'), 'status', '--worktree', 'feature-1', '--all-worktrees'],
      {
        cwd: testRepo.path,
        env: process.env,
        stdout: 'pipe',
        stderr: 'pipe',
      }
    );

    const stderr = await new Response(proc.stderr).text();
    await proc.exited;

    expect(proc.exitCode).toBe(1);
    expect(stderr).toContain('Cannot use both --worktree and --all-worktrees');
  });
});

describe('Multi-worktree specific worktree operations', () => {
  let testRepo: TestMultiWorktreeRepo;

  beforeAll(async () => {
    testRepo = await createMultiWorktreeRepo();

    // Initialize main worktree
    const initMainProc = Bun.spawn(
      ['bun', 'run', join(process.cwd(), 'src/cli.ts'), 'init'],
      {
        cwd: testRepo.path,
        env: process.env,
      }
    );
    await initMainProc.exited;

    // Initialize first worktree only
    const initProc = Bun.spawn(
      ['bun', 'run', join(process.cwd(), 'src/cli.ts'), 'init', '--worktree', testRepo.worktrees[0]!.name],
      {
        cwd: testRepo.path,
        env: process.env,
      }
    );
    await initProc.exited;
  });

  afterAll(() => {
    testRepo.cleanup();
  });

  test('e2e: status --worktree <name> shows specific worktree status', async () => {
    const proc = Bun.spawn(
      ['bun', 'run', join(process.cwd(), 'src/cli.ts'), 'status', '--worktree', testRepo.worktrees[0]!.name],
      {
        cwd: testRepo.path,
        env: process.env,
        stdout: 'pipe',
      }
    );

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain('takopi-smithers status');
  });

  test('e2e: stop --worktree <name> handles non-running supervisor', async () => {
    const proc = Bun.spawn(
      ['bun', 'run', join(process.cwd(), 'src/cli.ts'), 'stop', '--worktree', testRepo.worktrees[0]!.name],
      {
        cwd: testRepo.path,
        env: process.env,
        stdout: 'pipe',
      }
    );

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain('No running supervisor');
  });

  test('e2e: restart --worktree <name> handles non-running supervisor', async () => {
    const proc = Bun.spawn(
      ['bun', 'run', join(process.cwd(), 'src/cli.ts'), 'restart', '--worktree', testRepo.worktrees[0]!.name],
      {
        cwd: testRepo.path,
        env: process.env,
        stdout: 'pipe',
      }
    );

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain('No running supervisor');
  });
});
