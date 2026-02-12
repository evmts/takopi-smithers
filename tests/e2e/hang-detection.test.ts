import { test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createTestRepo, type TestRepo } from './setup';
import type { Subprocess } from 'bun';

// Skip these tests for now - they use old workflow format
// TODO: Update these tests to work with new smithers-orchestrator API

let testRepo: TestRepo;
let supervisorProc: Subprocess | null = null;

beforeEach(async () => {
  testRepo = await createTestRepo({ installDeps: true });
});

afterEach(async () => {
  // Kill supervisor if still running
  if (supervisorProc && supervisorProc.exitCode === null) {
    supervisorProc.kill();
    await supervisorProc.exited;
  }
  testRepo.cleanup();
});

test.skip('hang detection E2E - simulated hung workflow', async () => {
  // 1. Copy test fixtures into test repo
  const fixturesDir = path.join(__dirname, 'fixtures');
  const configPath = path.join(testRepo.path, '.takopi-smithers');
  const smithersDir = path.join(testRepo.path, '.smithers');

  fs.mkdirSync(configPath, { recursive: true });
  fs.mkdirSync(smithersDir, { recursive: true });

  // Copy test config
  fs.copyFileSync(
    path.join(fixturesDir, 'test-config.toml'),
    path.join(configPath, 'config.toml')
  );

  // Copy hanging workflow
  fs.copyFileSync(
    path.join(fixturesDir, 'hanging-workflow.tsx'),
    path.join(smithersDir, 'workflow.tsx')
  );

  // 2. Start smithers directly (not via supervisor) to test basic hang behavior
  const smithersProc = Bun.spawn(
    ['bunx', 'smithers', 'run', '.smithers/workflow.tsx'],
    {
      cwd: testRepo.path,
      stdout: 'pipe',
      stderr: 'pipe',
    }
  );

  // 3. Wait for initial heartbeat to be written
  await new Promise(resolve => setTimeout(resolve, 3000));

  const dbPath = path.join(smithersDir, 'workflow.db');

  // Debug: Always capture output to see what's happening
  const stdout = await new Response(smithersProc.stdout).text();
  const stderr = await new Response(smithersProc.stderr).text();
  console.log('Smithers stdout:', stdout.slice(0, 500));
  console.log('Smithers stderr:', stderr.slice(0, 500));
  console.log('Smithers exitCode:', smithersProc.exitCode);
  console.log('Files in .smithers:', fs.readdirSync(smithersDir));

  if (!fs.existsSync(dbPath)) {
    throw new Error('DB was not created!');
  }

  // Check what tables exist
  const db = new Database(dbPath);
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Tables in DB:', tables);

  const initialHeartbeat = db.query(
    "SELECT value FROM state WHERE key = 'supervisor.heartbeat'"
  ).get() as { value: string } | undefined;

  expect(initialHeartbeat).toBeDefined();
  const initialTime = new Date(initialHeartbeat!.value).getTime();

  // 4. Wait for hang threshold + buffer (15s + 10s = 25s)
  await new Promise(resolve => setTimeout(resolve, 25000));

  // 5. Verify heartbeat is now stale
  const currentHeartbeat = db.query(
    "SELECT value FROM state WHERE key = 'supervisor.heartbeat'"
  ).get() as { value: string } | undefined;

  const currentTime = Date.now();
  const heartbeatTime = new Date(currentHeartbeat!.value).getTime();
  const ageSeconds = (currentTime - heartbeatTime) / 1000;

  expect(ageSeconds).toBeGreaterThan(15); // Should be stale

  // 6. Verify process is still running (it's hung, not crashed)
  expect(smithersProc.exitCode).toBeNull();

  // Cleanup
  smithersProc.kill();
  await smithersProc.exited;
  db.close();
}, { timeout: 40000 }); // 40s timeout for this test

test.skip('hang detection with supervisor - kills and restarts', async () => {
  // This test actually runs the supervisor and verifies it kills/restarts

  // 1. Setup test repo with fixtures
  const fixturesDir = path.join(__dirname, 'fixtures');
  const configPath = path.join(testRepo.path, '.takopi-smithers');
  const smithersDir = path.join(testRepo.path, '.smithers');
  const logsDir = path.join(configPath, 'logs');

  fs.mkdirSync(configPath, { recursive: true });
  fs.mkdirSync(smithersDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

  fs.copyFileSync(
    path.join(fixturesDir, 'test-config.toml'),
    path.join(configPath, 'config.toml')
  );

  fs.copyFileSync(
    path.join(fixturesDir, 'hanging-workflow.tsx'),
    path.join(smithersDir, 'workflow.tsx')
  );

  // 2. Start supervisor with --dry-run to skip Takopi
  supervisorProc = Bun.spawn(
    ['bun', 'run', path.join(process.cwd(), 'src/cli.ts'), 'start', '--dry-run'],
    {
      cwd: testRepo.path,
      stdout: 'pipe',
      stderr: 'pipe',
      env: process.env,
    }
  );

  // 3. Wait for hang detection + restart (15s hang + 10s buffer + 2s backoff = 27s)
  await new Promise(resolve => setTimeout(resolve, 30000));

  // 4. Check logs for hang detection message
  const logPath = path.join(logsDir, 'supervisor.log');
  expect(fs.existsSync(logPath)).toBe(true);

  const logContent = fs.readFileSync(logPath, 'utf-8');

  expect(logContent).toContain('Heartbeat is stale');
  expect(logContent).toContain('Killing hung process');

  // 5. Verify supervisor is still running (didn't crash)
  expect(supervisorProc.exitCode).toBeNull();
}, { timeout: 45000 });

test.skip('hang detection respects restart backoff schedule', async () => {
  // This test verifies backoff schedule is followed
  // Expected: 2s, 5s, 10s, 15s delays

  // Setup (similar to previous test)
  const fixturesDir = path.join(__dirname, 'fixtures');
  const configPath = path.join(testRepo.path, '.takopi-smithers');
  const smithersDir = path.join(testRepo.path, '.smithers');
  const logsDir = path.join(configPath, 'logs');

  fs.mkdirSync(configPath, { recursive: true });
  fs.mkdirSync(smithersDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

  fs.copyFileSync(
    path.join(fixturesDir, 'test-config.toml'),
    path.join(configPath, 'config.toml')
  );

  fs.copyFileSync(
    path.join(fixturesDir, 'hanging-workflow.tsx'),
    path.join(smithersDir, 'workflow.tsx')
  );

  supervisorProc = Bun.spawn(
    ['bun', 'run', path.join(process.cwd(), 'src/cli.ts'), 'start', '--dry-run'],
    {
      cwd: testRepo.path,
      stdout: 'pipe',
      stderr: 'pipe',
      env: process.env,
    }
  );

  // Wait long enough for 2 hang cycles
  // Cycle 1: 15s hang + 2s backoff = 17s
  // Cycle 2: 15s hang + 5s backoff = 20s
  // Total: ~40s
  await new Promise(resolve => setTimeout(resolve, 45000));

  const logPath = path.join(logsDir, 'supervisor.log');
  const logContent = fs.readFileSync(logPath, 'utf-8');

  // Check for backoff messages
  expect(logContent).toContain('Restarting Smithers in 2s');
  expect(logContent).toContain('attempt 1/');

  // Should have restarted at least once
  const restartMatches = logContent.match(/Restarting Smithers in \d+s/g);
  expect(restartMatches).toBeDefined();
  expect(restartMatches!.length).toBeGreaterThanOrEqual(1);
}, { timeout: 60000 });
