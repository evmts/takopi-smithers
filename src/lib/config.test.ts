import { test, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig, getTelegramCredentials } from "./config";

const TEST_DIR = "./test-config-temp";

beforeEach(async () => {
  await Bun.write(`${TEST_DIR}/.gitkeep`, "");
  process.chdir(TEST_DIR);
});

afterEach(async () => {
  process.chdir("..");
  await Bun.$`rm -rf ${TEST_DIR}`;
});

test("loadConfig parses TOML correctly", async () => {
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
restart_backoff_seconds = [5, 30, 120, 600]
max_restart_attempts = 20

[telegram]
bot_token = "test_token"
chat_id = 123456

[autoheal]
enabled = true
engine = "claude"
max_attempts = 3
`;

  await Bun.write(".takopi-smithers/config.toml", configToml);
  const config = await loadConfig(".takopi-smithers/config.toml");

  expect(config.version).toBe(1);
  expect(config.workflow.script).toBe(".smithers/workflow.tsx");
  expect(config.updates.interval_seconds).toBe(600);
  expect(config.health.restart_backoff_seconds).toEqual([5, 30, 120, 600]);
  expect(config.telegram.bot_token).toBe("test_token");
});

test("getTelegramCredentials returns config values", async () => {
  const config = {
    version: 1,
    workflow: { script: "", db: "" },
    updates: { enabled: true, interval_seconds: 600 },
    health: {
      heartbeat_key: "",
      heartbeat_write_interval_seconds: 30,
      hang_threshold_seconds: 300,
      restart_backoff_seconds: [5],
      max_restart_attempts: 10,
    },
    telegram: { bot_token: "test_token", chat_id: 123 },
    autoheal: { enabled: false, engine: "claude" as const, max_attempts: 3 },
  };

  const credentials = await getTelegramCredentials(config);
  expect(credentials).toEqual({ botToken: "test_token", chatId: 123 });
});
