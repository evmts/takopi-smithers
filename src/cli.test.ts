import { test, expect, describe } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const packageJsonPath = join(import.meta.dir, "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const cliSourcePath = join(import.meta.dir, "cli.ts");
const cliDistPath = join(import.meta.dir, "..", "dist", "cli.js");

describe("CLI Foundation", () => {
  test("cli.ts source file exists", () => {
    expect(existsSync(cliSourcePath)).toBe(true);
  });

  test("cli.ts has shebang", () => {
    const cliSource = readFileSync(cliSourcePath, "utf-8");
    expect(cliSource.startsWith("#!/usr/bin/env bun")).toBe(true);
  });

  test("package.json has correct bin entry", () => {
    expect(packageJson.bin).toBeDefined();
    expect(packageJson.bin["takopi-smithers"]).toBe("./dist/cli.js");
  });

  test("package.json has correct version", () => {
    expect(packageJson.version).toBe("1.0.0");
  });

  test("package.json has correct name", () => {
    expect(packageJson.name).toBe("takopi-smithers");
  });

  test("package.json has correct type", () => {
    expect(packageJson.type).toBe("module");
  });

  test("package.json has build script", () => {
    expect(packageJson.scripts.build).toBeDefined();
  });

  test("package.json has test script", () => {
    expect(packageJson.scripts.test).toBeDefined();
  });

  test("package.json has typecheck script", () => {
    expect(packageJson.scripts.typecheck).toBeDefined();
  });

  test("package.json has correct engines", () => {
    expect(packageJson.engines).toBeDefined();
    expect(packageJson.engines.node).toBe(">=18");
  });

  test("built CLI exists after build", () => {
    expect(existsSync(cliDistPath)).toBe(true);
  });
});
