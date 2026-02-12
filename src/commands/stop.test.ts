import { test, expect, describe } from "bun:test";
import { stop } from "./stop";

describe("stop command", () => {
  test("handles missing config in test mode", async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';

    try {
      await expect(stop({ keepTakopi: true })).rejects.toThrow();
    } finally {
      delete process.env.NODE_ENV;
    }
  });

  test("accepts options signature", () => {
    // Just verify the function signature is correct
    expect(typeof stop).toBe("function");
  });
});
