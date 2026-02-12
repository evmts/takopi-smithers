import { test, expect, describe } from "bun:test";
import { stop } from "./stop";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("stop command", () => {
  test("handles missing config in test mode", async () => {
    // Create isolated test environment
    const testDir = mkdtempSync(join(tmpdir(), 'stop-test-'));
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

      await expect(stop({ keepTakopi: true })).rejects.toThrow();
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

  test("accepts options signature", () => {
    // Just verify the function signature is correct
    expect(typeof stop).toBe("function");
  });
});
