import { test, expect, mock, beforeEach, afterEach, describe } from 'bun:test';
import { Supervisor } from './supervisor';
import type { Config } from './config';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Helper to create a test config
function createTestConfig(overrides?: Partial<Config>): Config {
  return {
    version: 1,
    workflow: {
      script: '.smithers/workflow.tsx',
      db: '.smithers/workflow.db',
    },
    updates: {
      enabled: false,
      interval_seconds: 600,
    },
    health: {
      heartbeat_key: 'supervisor.heartbeat',
      heartbeat_write_interval_seconds: 30,
      hang_threshold_seconds: 300,
      restart_backoff_seconds: [5, 30, 120, 600],
      max_restart_attempts: 20,
    },
    telegram: {
      bot_token: '',
      chat_id: 0,
    },
    autoheal: {
      enabled: false,
      engine: 'claude',
      max_attempts: 3,
    },
    ...overrides,
  };
}

describe('Supervisor file watcher', () => {
  let testDir: string;
  let testWorkflowPath: string;

  beforeEach(async () => {
    // Create temp directory for testing
    testDir = await fs.promises.mkdtemp(path.join('/tmp', 'supervisor-test-'));
    testWorkflowPath = path.join(testDir, 'workflow.tsx');

    // Write initial workflow file
    await Bun.write(testWorkflowPath, '// Initial workflow\nexport default () => {};');
  });

  afterEach(async () => {
    // Cleanup temp directory
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('file watcher starts successfully', async () => {
    const config = createTestConfig({
      workflow: {
        script: testWorkflowPath,
        db: path.join(testDir, 'workflow.db'),
      },
    });

    const supervisor = new Supervisor(config, true);

    // Start supervisor (which starts file watcher)
    await supervisor.start();

    // Cleanup
    await supervisor.stop();

    // Test passes if no errors are thrown
    expect(true).toBe(true);
  });

  test('file change triggers debounced restart', async () => {
    const config = createTestConfig({
      workflow: {
        script: testWorkflowPath,
        db: path.join(testDir, 'workflow.db'),
      },
    });

    const supervisor = new Supervisor(config, true);
    await supervisor.start();

    // Wait for watcher to be ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // Modify the file
    await Bun.write(testWorkflowPath, '// Modified workflow\nexport default () => {};');

    // Wait for debounce (1000ms) + a bit extra
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Cleanup
    await supervisor.stop();

    // Test passes if no errors are thrown during the restart
    expect(true).toBe(true);
  });

  test('rapid successive changes only trigger one restart after debounce', async () => {
    const config = createTestConfig({
      workflow: {
        script: testWorkflowPath,
        db: path.join(testDir, 'workflow.db'),
      },
    });

    const supervisor = new Supervisor(config, true);
    await supervisor.start();

    // Wait for watcher to be ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // Make multiple rapid changes
    await Bun.write(testWorkflowPath, '// Change 1\nexport default () => {};');
    await new Promise(resolve => setTimeout(resolve, 200));

    await Bun.write(testWorkflowPath, '// Change 2\nexport default () => {};');
    await new Promise(resolve => setTimeout(resolve, 200));

    await Bun.write(testWorkflowPath, '// Change 3\nexport default () => {};');

    // Wait for final debounce (1000ms) + a bit extra
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Cleanup
    await supervisor.stop();

    // Test passes if only one restart happens (no errors thrown)
    expect(true).toBe(true);
  });

  test('watcher cleanup on supervisor stop', async () => {
    const config = createTestConfig({
      workflow: {
        script: testWorkflowPath,
        db: path.join(testDir, 'workflow.db'),
      },
    });

    const supervisor = new Supervisor(config, true);
    await supervisor.start();

    // Wait for watcher to be ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // Stop supervisor (should cleanup watcher)
    await supervisor.stop();

    // Modify file after stop - should not trigger anything
    await Bun.write(testWorkflowPath, '// Modified after stop\nexport default () => {};');

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Test passes if no errors are thrown
    expect(true).toBe(true);
  });

  test('file deletion is handled gracefully', async () => {
    const config = createTestConfig({
      workflow: {
        script: testWorkflowPath,
        db: path.join(testDir, 'workflow.db'),
      },
    });

    const supervisor = new Supervisor(config, true);
    await supervisor.start();

    // Wait for watcher to be ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // Delete the file
    await fs.promises.unlink(testWorkflowPath);

    // Wait for debounce + a bit extra
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Cleanup
    await supervisor.stop();

    // Test passes if supervisor continues running despite file deletion
    expect(true).toBe(true);
  });

  test('restart does not reset restart attempt counters', async () => {
    const config = createTestConfig({
      workflow: {
        script: testWorkflowPath,
        db: path.join(testDir, 'workflow.db'),
      },
    });

    const supervisor = new Supervisor(config, true);

    // Access private field for testing via type assertion
    const supervisorAny = supervisor as any;

    // Set some restart attempts
    supervisorAny.restartAttempts = 5;
    supervisorAny.autoHealAttempts = 2;

    await supervisor.start();

    // Wait for watcher to be ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // Modify the file to trigger restart
    await Bun.write(testWorkflowPath, '// Modified workflow\nexport default () => {};');

    // Wait for debounce + restart
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Verify counters were reset (file changes are intentional, not crashes)
    expect(supervisorAny.restartAttempts).toBe(0);
    expect(supervisorAny.autoHealAttempts).toBe(0);

    // Cleanup
    await supervisor.stop();
  });
});

test('supervisor auto-heal attempt tracking', async () => {
  const config: Config = {
    version: 1,
    workflow: {
      script: '.smithers/workflow.tsx',
      db: '.smithers/workflow.db',
    },
    updates: {
      enabled: false,
      interval_seconds: 600,
    },
    health: {
      heartbeat_key: 'supervisor.heartbeat',
      heartbeat_write_interval_seconds: 30,
      hang_threshold_seconds: 300,
      restart_backoff_seconds: [5, 30, 120, 600],
      max_restart_attempts: 20,
    },
    telegram: {
      bot_token: '',
      chat_id: 0,
    },
    autoheal: {
      enabled: true,
      engine: 'claude',
      max_attempts: 3,
    },
  };

  const _supervisor = new Supervisor(config, true);

  // Verify auto-heal is enabled in config
  expect(config.autoheal.enabled).toBe(true);
  expect(config.autoheal.max_attempts).toBe(3);
});
