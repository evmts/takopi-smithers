import { test, expect } from "bun:test";
import { restart } from "./restart";

test("restart handles missing config gracefully", async () => {
  // This test verifies the restart command handles missing config
  // In test mode, it should throw instead of calling process.exit()

  // Set test environment
  process.env.NODE_ENV = 'test';

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
    expect(errors[0]).toContain("Failed to restart:");
  } finally {
    console.error = originalError;
    delete process.env.NODE_ENV;
  }
});
