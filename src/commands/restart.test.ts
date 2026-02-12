import { test, expect } from "bun:test";
import { restart } from "./restart";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("restart handles missing config gracefully", async () => {
  // This test verifies the restart command handles missing config
  // In test mode, it should throw instead of calling process.exit()

  // Create isolated test environment
  const testDir = mkdtempSync(join(tmpdir(), 'restart-test-'));
  const originalCwd = process.cwd();
  const originalHome = process.env.HOME;
  const originalConfigPath = process.env.TAKOPI_SMITHERS_CONFIG;
  const originalNodeEnv = process.env.NODE_ENV;

  try {
    // Set up isolated environment with no config files
    process.chdir(testDir);
    process.env.HOME = testDir;
    process.env.NODE_ENV = 'test';
    delete process.env.TAKOPI_SMITHERS_CONFIG;

    // Mock console to capture output
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: any[]) => {
      errors.push(args.join(" "));
    };

    try {
      await expect(restart()).rejects.toThrow();

      // Should have logged error
      expect(errors.length).toBeGreaterThan(0);
      // Error could be from config loading or git worktree detection
      expect(errors[0]).toMatch(/Failed to (restart:|list worktrees:)/);
    } finally {
      console.error = originalError;
    }
  } finally {
    // Restore environment
    process.chdir(originalCwd);
    process.env.HOME = originalHome;
    if (originalConfigPath) {
      process.env.TAKOPI_SMITHERS_CONFIG = originalConfigPath;
    }
    if (originalNodeEnv) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
    rmSync(testDir, { recursive: true, force: true });
  }
});
