import { test, expect } from 'bun:test';
import { showVersion } from './version';
import packageJson from '../../package.json';

test('showVersion outputs correct format', () => {
  // Capture console output
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  showVersion();

  console.log = originalLog;

  expect(logs[0]).toBe(`takopi-smithers v${packageJson.version}`);
});
