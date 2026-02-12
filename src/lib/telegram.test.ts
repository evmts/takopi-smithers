import { test, expect } from "bun:test";
import { formatStatusMessage } from "./telegram";

test("formatStatusMessage creates valid message", () => {
  const message = formatStatusMessage(
    "test-repo",
    "main",
    "running",
    "Workflow is running smoothly",
    new Date().toISOString()
  );

  expect(message).toContain("test-repo");
  expect(message).toContain("main");
  expect(message).toContain("running");
  expect(message).toContain("Workflow is running smoothly");
  expect(message).toContain("Last heartbeat");
});

test("formatStatusMessage handles null values", () => {
  const message = formatStatusMessage("test-repo", "main", null, null, null);

  expect(message).toContain("test-repo");
  expect(message).toContain("main");
  expect(message).toContain("unknown");
});

test("formatStatusMessage includes status emoji", () => {
  const runningMsg = formatStatusMessage("test-repo", "main", "running", null, null);
  expect(runningMsg).toContain("🟢");

  const errorMsg = formatStatusMessage("test-repo", "main", "error", null, null);
  expect(errorMsg).toContain("🔴");

  const doneMsg = formatStatusMessage("test-repo", "main", "done", null, null);
  expect(doneMsg).toContain("✅");
});

test("formatStatusMessage shows heartbeat age", () => {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const message = formatStatusMessage("test-repo", "main", "running", null, fiveMinutesAgo);

  expect(message).toContain("5m ago");
});
