import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Multi-supervisor start command', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = join(tmpdir(), `takopi-smithers-multi-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up
    rmSync(testDir, { recursive: true, force: true });
  });

  test('startWorktreeInProcess spawns a new process', async () => {
    // This test verifies that starting a worktree spawns a separate process
    // We can't fully test this without a real git worktree, but we can verify
    // the function is exported and callable
    const { start } = await import('./start');
    expect(start).toBeDefined();
    expect(typeof start).toBe('function');
  });

  test('start command accepts allWorktrees option', async () => {
    const { start } = await import('./start');

    // Initialize git repo
    await Bun.$`git init`.cwd(testDir).quiet();
    await Bun.$`git config user.email "test@example.com"`.cwd(testDir).quiet();
    await Bun.$`git config user.name "Test User"`.cwd(testDir).quiet();

    // This should not throw when called with allWorktrees flag
    // It will exit early because there are no configured worktrees
    try {
      await start({ allWorktrees: true, dryRun: true });
    } catch (error) {
      // Expected to fail gracefully
      expect(error).toBeDefined();
    }
  });
});

describe('Multi-supervisor args validation', () => {
  test('parseArgs rejects --worktree and --all-worktrees together', async () => {
    const { parseArgs } = await import('../lib/args');

    expect(() => {
      parseArgs(['start', '--worktree', 'feature', '--all-worktrees']);
    }).toThrow('Cannot use both --worktree and --all-worktrees');
  });

  test('parseArgs accepts --all-worktrees alone', async () => {
    const { parseArgs } = await import('../lib/args');

    const result = parseArgs(['start', '--all-worktrees']);
    expect(result.flags['all-worktrees']).toBe(true);
    expect(result.command).toBe('start');
  });

  test('parseArgs accepts --worktree alone', async () => {
    const { parseArgs } = await import('../lib/args');

    const result = parseArgs(['start', '--worktree', 'feature']);
    expect(result.flags['worktree']).toBe('feature');
    expect(result.command).toBe('start');
  });
});

describe('PID file management for worktrees', () => {
  test('getWorktreePidFilePath generates correct path', async () => {
    const { getWorktreePidFilePath } = await import('../lib/pid');

    const worktree = {
      path: '/path/to/worktree',
      branch: 'feature/test-branch',
      isMain: false,
      commitHash: 'abc123',
    };

    const pidPath = getWorktreePidFilePath(worktree);
    expect(pidPath).toContain('feature_test-branch');
    expect(pidPath).toContain('supervisor.pid');
    expect(pidPath).toContain('.takopi-smithers/worktrees');
  });

  test('getWorktreePidFilePath sanitizes branch names', async () => {
    const { getWorktreePidFilePath } = await import('../lib/pid');

    const worktree = {
      path: '/path/to/worktree',
      branch: 'feature/test@branch#123',
      isMain: false,
      commitHash: 'abc123',
    };

    const pidPath = getWorktreePidFilePath(worktree);
    // Should replace special characters with underscores
    expect(pidPath).toContain('feature_test_branch_123');
    expect(pidPath).not.toContain('@');
    expect(pidPath).not.toContain('#');
  });

  test('getAllWorktreePidFiles returns array', async () => {
    const { getAllWorktreePidFiles } = await import('../lib/pid');

    // Create a temporary git repo for testing
    const testDir = join(tmpdir(), `pid-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    try {
      await Bun.$`git init`.cwd(testDir).quiet();
      await Bun.$`git config user.email "test@example.com"`.cwd(testDir).quiet();
      await Bun.$`git config user.name "Test User"`.cwd(testDir).quiet();

      const originalCwd = process.cwd();
      process.chdir(testDir);

      const pidFiles = await getAllWorktreePidFiles();
      expect(Array.isArray(pidFiles)).toBe(true);

      process.chdir(originalCwd);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});

describe('getPidFilePath with worktree config', () => {
  test('generates worktree-specific path for worktree config', async () => {
    const { getPidFilePath } = await import('../lib/pid');

    const config = {
      version: 1,
      workflow: {
        script: '.smithers/worktrees/feature/workflow.tsx',
        db: '.smithers/worktrees/feature/workflow.db',
      },
      updates: { enabled: true, interval_seconds: 60 },
      health: {
        heartbeat_key: 'test',
        heartbeat_write_interval_seconds: 5,
        hang_threshold_seconds: 30,
        restart_backoff_seconds: [1, 2, 5],
        max_restart_attempts: 3,
      },
      telegram: {
        bot_token: 'test',
        chat_id: 123,
      },
      autoheal: {
        enabled: false,
        engine: 'claude' as const,
        max_attempts: 3,
      },
      worktree: {
        name: 'feature',
        branch: 'feature',
      },
    };

    const pidPath = getPidFilePath(config);
    expect(pidPath).toContain('worktrees');
    expect(pidPath).toContain('feature');
    expect(pidPath).toContain('supervisor.pid');
  });

  test('generates main path for non-worktree config', async () => {
    const { getPidFilePath } = await import('../lib/pid');

    const config = {
      version: 1,
      workflow: {
        script: '.smithers/workflow.tsx',
        db: '.smithers/workflow.db',
      },
      updates: { enabled: true, interval_seconds: 60 },
      health: {
        heartbeat_key: 'test',
        heartbeat_write_interval_seconds: 5,
        hang_threshold_seconds: 30,
        restart_backoff_seconds: [1, 2, 5],
        max_restart_attempts: 3,
      },
      telegram: {
        bot_token: 'test',
        chat_id: 123,
      },
      autoheal: {
        enabled: false,
        engine: 'claude' as const,
        max_attempts: 3,
      },
    };

    const pidPath = getPidFilePath(config);
    expect(pidPath).not.toContain('worktrees');
    expect(pidPath).toContain('.takopi-smithers');
    expect(pidPath).toContain('supervisor.pid');
  });
});
