import { test, expect } from "bun:test";
import { getVersion } from "./version";

test("getVersion returns package version", async () => {
  const version = await getVersion();
  expect(version).toBe("1.0.0");
});

test("getVersion returns valid semver format", async () => {
  const version = await getVersion();
  expect(version).toMatch(/^\d+\.\d+\.\d+/);
});
