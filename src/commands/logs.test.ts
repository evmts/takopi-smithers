import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { logs as logsCommand } from './logs';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

describe('logs command', () => {
  const testLogDir = '.takopi-smithers/logs';
  const testLogPath = `${testLogDir}/supervisor.log`;

  beforeEach(() => {
    mkdirSync(testLogDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync('.takopi-smithers', { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test('should error if log file does not exist', async () => {
    rmSync(testLogPath, { force: true });

    let exitCode = 0;
    const originalExit = process.exit;
    process.exit = ((code: number) => {
      exitCode = code;
    }) as any;

    try {
      await logsCommand();
    } catch {
      // Expected to throw
    }

    process.exit = originalExit;
    expect(exitCode).toBe(1);
  });

  test('should print last N lines by default', async () => {
    const logContent = Array.from({ length: 100 }, (_, i) =>
      `[2026-02-12T00:00:${i.toString().padStart(2, '0')}Z] [info] Log line ${i}`
    ).join('\n');

    writeFileSync(testLogPath, logContent);

    // Capture console output
    const capturedLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => capturedLogs.push(msg);

    await logsCommand({ lines: 10 });

    console.log = originalLog;

    expect(capturedLogs.length).toBe(10);
    expect(capturedLogs[0]).toContain('Log line 90');
    expect(capturedLogs[9]).toContain('Log line 99');
  });

  test('should filter by log level', async () => {
    const logContent = [
      '[2026-02-12T00:00:00Z] [info] Info message',
      '[2026-02-12T00:00:01Z] [warn] Warning message',
      '[2026-02-12T00:00:02Z] [error] Error message',
      '[2026-02-12T00:00:03Z] [info] Another info',
    ].join('\n');

    writeFileSync(testLogPath, logContent);

    const capturedLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => capturedLogs.push(msg);

    await logsCommand({ level: 'error' });

    console.log = originalLog;

    expect(capturedLogs.length).toBe(1);
    expect(capturedLogs[0]).toContain('Error message');
  });
});
