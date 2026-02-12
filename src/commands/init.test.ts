import { test, expect, beforeEach, afterEach } from "bun:test";
import { init } from "./init";

const TEST_DIR = "./test-init-temp";
let originalCwd: string;

beforeEach(async () => {
  // Save original directory
  originalCwd = process.cwd();

  // Create a test directory with .git using Bun APIs
  await Bun.write(`${TEST_DIR}/.git/.gitkeep`, "");
  // Create a minimal git config file so git repo detection works
  await Bun.write(`${TEST_DIR}/.git/config`, '[core]\n\trepositoryformatversion = 0\n');
  process.chdir(TEST_DIR);
});

afterEach(async () => {
  // Return to original directory
  process.chdir(originalCwd);

  // Clean up test directory using Bun's shell
  await Bun.$`rm -rf ${TEST_DIR}`;
});

test("init creates all required files", async () => {
  await init();

  expect(await Bun.file(".takopi-smithers/config.toml").exists()).toBe(true);
  expect(await Bun.file(".smithers/workflow.tsx").exists()).toBe(true);
  expect(await Bun.file("TAKOPI_SMITHERS.md").exists()).toBe(true);
  expect(await Bun.file("CLAUDE.md").exists()).toBe(true);
  expect(await Bun.file("AGENTS.md").exists()).toBe(true);
});

test("init is idempotent - doesn't overwrite existing files", async () => {
  // First init
  await init();

  // Modify a file
  const customContent = "# CUSTOM CONTENT";
  await Bun.write("TAKOPI_SMITHERS.md", customContent);

  // Second init
  await init();

  // Should still have custom content
  const content = await Bun.file("TAKOPI_SMITHERS.md").text();
  expect(content).toBe(customContent);
});

test("init with force flag creates backups", async () => {
  // First init
  await init();

  // Second init with force
  await init({ force: true });

  // Should have backup files
  const files = await Array.fromAsync(
    new Bun.Glob("**/*.bak.*").scan({ cwd: "." })
  );
  expect(files.length).toBeGreaterThan(0);
});

test("init fails if not in git repo", async () => {
  // Remove .git directory using Bun's shell
  await Bun.$`rm -rf .git`;

  // Mock process.exit to prevent test from exiting
  const exitMock = (code?: number) => {
    throw new Error(`process.exit called with code ${code}`);
  };
  const originalExit = process.exit;
  process.exit = exitMock as any;

  try {
    await expect(init()).rejects.toThrow();
  } finally {
    process.exit = originalExit;
  }
});

test("config.toml has correct structure", async () => {
  await init();

  const configContent = await Bun.file(".takopi-smithers/config.toml").text();

  // Check for key sections
  expect(configContent).toContain("version = 1");
  expect(configContent).toContain("[workflow]");
  expect(configContent).toContain("[updates]");
  expect(configContent).toContain("[health]");
  expect(configContent).toContain("[telegram]");
  expect(configContent).toContain("[autoheal]");

  // Check specific values
  expect(configContent).toContain('script = ".smithers/workflow.tsx"');
  expect(configContent).toContain('heartbeat_key = "supervisor.heartbeat"');
});

test("workflow.tsx includes supervisor state keys", async () => {
  await init();

  const workflowContent = await Bun.file(".smithers/workflow.tsx").text();

  // Check for supervisor state keys
  expect(workflowContent).toContain("supervisor.heartbeat");
  expect(workflowContent).toContain("supervisor.status");
  expect(workflowContent).toContain("supervisor.summary");

  // Check for heartbeat updater
  expect(workflowContent).toContain("setInterval");
  expect(workflowContent).toContain("30000"); // 30 seconds
});

test("workflow.tsx uses multi-phase smithers workflow pattern", async () => {
  await init();

  const workflowContent = await Bun.file(".smithers/workflow.tsx").text();

  // Check for smithers-orchestrator imports
  expect(workflowContent).toContain('from "smithers-orchestrator"');
  expect(workflowContent).toContain("ClaudeCodeAgent");
  expect(workflowContent).toContain("drizzle-orm");

  // Check for multi-phase schema tables
  expect(workflowContent).toContain("planTable");
  expect(workflowContent).toContain("implementTable");
  expect(workflowContent).toContain("reviewTable");
  expect(workflowContent).toContain("fixTable");

  // Check for state table creation
  expect(workflowContent).toContain("CREATE TABLE IF NOT EXISTS state");

  // Check for updateState helper
  expect(workflowContent).toContain("function updateState");

  // Check for workflow export with db
  expect(workflowContent).toContain("export default smithers(db,");

  // Check for phase state machine
  expect(workflowContent).toContain("computePhase");

  // Check for process.on('beforeExit')
  expect(workflowContent).toContain('process.on("beforeExit"');
});

test("CLAUDE.md appends to existing file", async () => {
  // Create existing CLAUDE.md
  const existingContent = "# Existing content\n\nSome notes";
  await Bun.write("CLAUDE.md", existingContent);

  // Run init
  await init();

  const content = await Bun.file("CLAUDE.md").text();

  // Should contain both existing and new content
  expect(content).toContain("Existing content");
  expect(content).toContain("@TAKOPI_SMITHERS.md");
});

test("AGENTS.md appends to existing file", async () => {
  // Create existing AGENTS.md
  const existingContent = "# Existing agents\n\nSome instructions";
  await Bun.write("AGENTS.md", existingContent);

  // Run init
  await init();

  const content = await Bun.file("AGENTS.md").text();

  // Should contain both existing and new content
  expect(content).toContain("Existing agents");
  expect(content).toContain("TAKOPI_SMITHERS.md");
});
