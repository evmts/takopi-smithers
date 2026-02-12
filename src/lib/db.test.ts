import { test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  queryWorkflowState,
  isHeartbeatStale,
  getHeartbeatAge,
  formatHeartbeatAge,
  getWorkflowProgress,
} from "./db";

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

test("getHeartbeatAge returns age in seconds", () => {
  const db = new Database(TEST_DB);
  const testDate = new Date(Date.now() - 150 * 1000); // 150s ago
  db.run("INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)", [
    "supervisor.heartbeat",
    testDate.toISOString(),
  ]);
  db.close();

  const age = getHeartbeatAge(TEST_DB);
  expect(age).toBeGreaterThan(145);
  expect(age).toBeLessThan(155);
});

test("getHeartbeatAge returns null for missing heartbeat", () => {
  const age = getHeartbeatAge(TEST_DB);
  expect(age).toBe(null);
});

test("formatHeartbeatAge formats seconds", () => {
  expect(formatHeartbeatAge(30)).toBe("30 seconds ago");
  expect(formatHeartbeatAge(90)).toBe("1 minute ago");
  expect(formatHeartbeatAge(150)).toBe("2 minutes ago");
  expect(formatHeartbeatAge(3700)).toBe("1 hour ago");
  expect(formatHeartbeatAge(7300)).toBe("2 hours ago");
  expect(formatHeartbeatAge(86500)).toBe("1 day ago");
  expect(formatHeartbeatAge(172900)).toBe("2 days ago");
});

test("getWorkflowProgress returns restart and autoheal counts", () => {
  const db = new Database(TEST_DB);
  db.run("INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)", [
    "supervisor.restart_count",
    "5",
  ]);
  db.run("INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)", [
    "supervisor.autoheal_count",
    "2",
  ]);
  db.close();

  const progress = getWorkflowProgress(TEST_DB);
  expect(progress.restarts).toBe(5);
  expect(progress.autoheals).toBe(2);
});

test("getWorkflowProgress returns zeros for missing data", () => {
  const progress = getWorkflowProgress(TEST_DB);
  expect(progress.restarts).toBe(0);
  expect(progress.autoheals).toBe(0);
});
