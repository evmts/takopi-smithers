import { test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { queryWorkflowState, isHeartbeatStale } from "./db";

const TEST_DB = "./test.db";

beforeEach(async () => {
  const db = new Database(TEST_DB);
  db.run("CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT)");
  db.close();
});

afterEach(async () => {
  await Bun.$`rm -f ${TEST_DB}`;
});

test("queryWorkflowState reads state keys", () => {
  const db = new Database(TEST_DB);
  db.run("INSERT INTO state (key, value) VALUES (?, ?)", [
    "supervisor.status",
    "running",
  ]);
  db.run("INSERT INTO state (key, value) VALUES (?, ?)", [
    "supervisor.summary",
    "Test summary",
  ]);
  db.run("INSERT INTO state (key, value) VALUES (?, ?)", [
    "supervisor.heartbeat",
    new Date().toISOString(),
  ]);
  db.close();

  const state = queryWorkflowState(TEST_DB);
  expect(state.status).toBe("running");
  expect(state.summary).toBe("Test summary");
  expect(state.heartbeat).toBeDefined();
});

test("isHeartbeatStale detects old heartbeat", () => {
  const oldDate = new Date(Date.now() - 400 * 1000); // 400s ago
  expect(isHeartbeatStale(oldDate.toISOString(), 300)).toBe(true);

  const recentDate = new Date(Date.now() - 100 * 1000); // 100s ago
  expect(isHeartbeatStale(recentDate.toISOString(), 300)).toBe(false);
});
