import { test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { status } from "./status";

const TEST_DIR = "./test-status-temp";
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  await Bun.write(`${TEST_DIR}/.gitkeep`, "");
  process.chdir(TEST_DIR);

  // Create config
  const configToml = `
version = 1
[workflow]
script = ".smithers/workflow.tsx"
db = ".smithers/workflow.db"
[updates]
enabled = true
interval_seconds = 600
[health]
heartbeat_key = "supervisor.heartbeat"
heartbeat_write_interval_seconds = 30
hang_threshold_seconds = 300
restart_backoff_seconds = [5]
max_restart_attempts = 20
[telegram]
bot_token = ""
chat_id = 0
[autoheal]
enabled = false
engine = "claude"
max_attempts = 3
`;
  await Bun.write(".takopi-smithers/config.toml", configToml);

  // Create DB with state
  await Bun.write(".smithers/.gitkeep", ""); // Ensure directory exists
  const db = new Database(".smithers/workflow.db");
  db.run("CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT)");
  db.run("INSERT INTO state (key, value) VALUES (?, ?)", [
    "supervisor.status",
    "running",
  ]);
  db.run("INSERT INTO state (key, value) VALUES (?, ?)", [
    "supervisor.heartbeat",
    new Date().toISOString(),
  ]);
  db.close();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await Bun.$`rm -rf ${TEST_DIR}`;
});

test("status command prints workflow status", async () => {
  // This test just ensures status() doesn't crash
  // The function outputs to console and doesn't return anything
  await status();
  // If we got here without throwing, test passes
  expect(true).toBe(true);
});

test("status command outputs JSON format", async () => {
  const capturedOutput: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => capturedOutput.push(msg);

  await status({ json: true });

  console.log = originalLog;

  // Should output valid JSON
  const output = capturedOutput.join('\n');
  expect(() => JSON.parse(output)).not.toThrow();

  const parsed = JSON.parse(output);
  expect(parsed).toHaveProperty('status');
  expect(parsed).toHaveProperty('heartbeatOk');
  expect(parsed).toHaveProperty('supervisorRunning');
});
