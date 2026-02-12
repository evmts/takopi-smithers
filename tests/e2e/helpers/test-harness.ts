import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Subprocess } from 'bun';
import Database from 'bun:sqlite';

export interface TestHarness {
  path: string;
  cliPath: string;
  cleanup: () => Promise<void>;

  // Git operations
  initGit: () => Promise<void>;
  createCommit: (message: string) => Promise<void>;

  // CLI operations
  runInit: (args?: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  runStart: (args?: string[]) => Promise<Subprocess>;
  runStatus: (args?: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  runStop: (args?: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  runRestart: (args?: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  runDoctor: () => Promise<{ exitCode: number; stdout: string; stderr: string }>;

  // File operations
  readConfig: () => Promise<string>;
  writeConfig: (content: string) => Promise<void>;
  readWorkflow: () => Promise<string>;
  writeWorkflow: (content: string) => Promise<void>;
  injectWorkflowError: (errorType: 'syntax' | 'runtime') => Promise<void>;

  // Database operations
  queryDb: <T = any>(query: string, params?: any[]) => T[];
  getHeartbeat: () => string | null;
  getStatus: () => { status: string | null; summary: string | null; heartbeat: string | null; last_error: string | null };
  waitForHeartbeat: (timeoutMs?: number) => Promise<boolean>;

  // Process management
  killProcess: (proc: Subprocess) => Promise<void>;
  waitForProcessExit: (proc: Subprocess, timeoutMs?: number) => Promise<number | null>;

  // Assertions
  assertFileExists: (path: string) => void;
  assertDbTableExists: (tableName: string) => boolean;
  waitForCondition: (condition: () => boolean, timeoutMs?: number, checkIntervalMs?: number) => Promise<boolean>;
}

export interface TestHarnessOptions {
  installDeps?: boolean;
  createPackageJson?: boolean;
}

/**
 * Creates a comprehensive test harness for E2E testing
 */
export async function createTestHarness(options: TestHarnessOptions = {}): Promise<TestHarness> {
  const testPath = join(tmpdir(), `takopi-smithers-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  const cliPath = join(process.cwd(), 'src/cli.ts');

  // Create test directory
  await mkdir(testPath, { recursive: true });

  // Create package.json if requested
  if (options.createPackageJson !== false) {
    const pkg = {
      name: 'test-harness',
      version: '1.0.0',
      type: 'module',
      dependencies: {
        'smithers-orchestrator': '*',
        'react': '*',
        'drizzle-orm': '*',
        'zod': '*',
        'ai': '*',
        '@ai-sdk/anthropic': '*',
      },
    };
    await writeFile(join(testPath, 'package.json'), JSON.stringify(pkg, null, 2));
  }

  // Symlink node_modules for faster tests
  if (options.installDeps) {
    try {
      const mainNodeModules = join(process.cwd(), 'node_modules');
      const testNodeModules = join(testPath, 'node_modules');

      if (existsSync(mainNodeModules)) {
        await Bun.$`ln -s ${mainNodeModules} ${testNodeModules}`.cwd(testPath).quiet();
      }
    } catch (err) {
      // Fallback to install
      await Bun.$`bun install`.cwd(testPath).quiet();
    }
  }

  const harness: TestHarness = {
    path: testPath,
    cliPath,

    cleanup: async () => {
      try {
        if (existsSync(testPath)) {
          await rm(testPath, { recursive: true, force: true });
        }
      } catch (err) {
        console.warn(`Cleanup warning: ${err}`);
      }
    },

    // Git operations
    initGit: async () => {
      await Bun.$`git init`.cwd(testPath).quiet();
      await Bun.$`git config user.email "test@example.com"`.cwd(testPath).quiet();
      await Bun.$`git config user.name "Test User"`.cwd(testPath).quiet();
    },

    createCommit: async (message: string) => {
      await Bun.$`git add .`.cwd(testPath).quiet();
      await Bun.$`git commit -m ${message}`.cwd(testPath).quiet();
    },

    // CLI operations
    runInit: async (args: string[] = []) => {
      const proc = Bun.spawn(['bun', cliPath, 'init', ...args], {
        cwd: testPath,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      await proc.exited;
      return { exitCode: proc.exitCode ?? -1, stdout, stderr };
    },

    runStart: async (args: string[] = []) => {
      const proc = Bun.spawn(['bun', cliPath, 'start', ...args], {
        cwd: testPath,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 500));
      return proc;
    },

    runStatus: async (args: string[] = []) => {
      const proc = Bun.spawn(['bun', cliPath, 'status', ...args], {
        cwd: testPath,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      await proc.exited;
      return { exitCode: proc.exitCode ?? -1, stdout, stderr };
    },

    runStop: async (args: string[] = []) => {
      const proc = Bun.spawn(['bun', cliPath, 'stop', ...args], {
        cwd: testPath,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      await proc.exited;
      return { exitCode: proc.exitCode ?? -1, stdout, stderr };
    },

    runRestart: async (args: string[] = []) => {
      const proc = Bun.spawn(['bun', cliPath, 'restart', ...args], {
        cwd: testPath,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      await proc.exited;
      return { exitCode: proc.exitCode ?? -1, stdout, stderr };
    },

    runDoctor: async () => {
      const proc = Bun.spawn(['bun', cliPath, 'doctor'], {
        cwd: testPath,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      await proc.exited;
      return { exitCode: proc.exitCode ?? -1, stdout, stderr };
    },

    // File operations
    readConfig: async () => {
      return await Bun.file(join(testPath, '.takopi-smithers/config.toml')).text();
    },

    writeConfig: async (content: string) => {
      await writeFile(join(testPath, '.takopi-smithers/config.toml'), content);
    },

    readWorkflow: async () => {
      return await Bun.file(join(testPath, '.smithers/workflow.tsx')).text();
    },

    writeWorkflow: async (content: string) => {
      await writeFile(join(testPath, '.smithers/workflow.tsx'), content);
    },

    injectWorkflowError: async (errorType: 'syntax' | 'runtime') => {
      const current = await harness.readWorkflow();

      if (errorType === 'syntax') {
        // Inject a syntax error - missing closing brace
        const modified = current.replace(
          'export default smithers',
          '{ this is a syntax error\nexport default smithers'
        );
        await harness.writeWorkflow(modified);
      } else {
        // Inject a runtime error - throw in the workflow
        const modified = current.replace(
          '<Workflow name=',
          `{(() => { throw new Error("Injected runtime error"); })()}\n<Workflow name=`
        );
        await harness.writeWorkflow(modified);
      }
    },

    // Database operations
    queryDb: <T = any>(query: string, params: any[] = []): T[] => {
      const dbPath = join(testPath, '.smithers/workflow.db');
      if (!existsSync(dbPath)) return [];

      const db = new Database(dbPath, { readonly: true });
      try {
        const stmt = db.query(query);
        return stmt.all(...params) as T[];
      } finally {
        db.close();
      }
    },

    getHeartbeat: () => {
      const rows = harness.queryDb<{ value: string }>(
        'SELECT value FROM state WHERE key = ?',
        ['supervisor.heartbeat']
      );
      return rows[0]?.value ?? null;
    },

    getStatus: () => {
      const rows = harness.queryDb<{ key: string; value: string }>(
        `SELECT key, value FROM state WHERE key IN (?, ?, ?, ?)`,
        ['supervisor.status', 'supervisor.summary', 'supervisor.heartbeat', 'supervisor.last_error']
      );

      const state: any = {
        status: null,
        summary: null,
        heartbeat: null,
        last_error: null,
      };

      for (const row of rows) {
        if (row.key === 'supervisor.status') state.status = row.value;
        if (row.key === 'supervisor.summary') state.summary = row.value;
        if (row.key === 'supervisor.heartbeat') state.heartbeat = row.value;
        if (row.key === 'supervisor.last_error') state.last_error = row.value;
      }

      return state;
    },

    waitForHeartbeat: async (timeoutMs: number = 10000): Promise<boolean> => {
      const startTime = Date.now();

      while (Date.now() - startTime < timeoutMs) {
        const heartbeat = harness.getHeartbeat();
        if (heartbeat) return true;
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      return false;
    },

    // Process management
    killProcess: async (proc: Subprocess) => {
      if (proc.exitCode === null) {
        proc.kill();
        await proc.exited;
      }
    },

    waitForProcessExit: async (proc: Subprocess, timeoutMs: number = 5000): Promise<number | null> => {
      const startTime = Date.now();

      while (Date.now() - startTime < timeoutMs) {
        if (proc.exitCode !== null) return proc.exitCode;
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      return null;
    },

    // Assertions
    assertFileExists: (path: string) => {
      const fullPath = join(testPath, path);
      if (!existsSync(fullPath)) {
        throw new Error(`Expected file to exist: ${path}`);
      }
    },

    assertDbTableExists: (tableName: string): boolean => {
      const rows = harness.queryDb<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        [tableName]
      );
      return rows.length > 0;
    },

    waitForCondition: async (
      condition: () => boolean,
      timeoutMs: number = 10000,
      checkIntervalMs: number = 500
    ): Promise<boolean> => {
      const startTime = Date.now();

      while (Date.now() - startTime < timeoutMs) {
        if (condition()) return true;
        await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
      }

      return false;
    },
  };

  return harness;
}

/**
 * Mock adapter for testing auto-heal without requiring real AI agents
 */
export class MockAutoHealAdapter {
  public invokeCount = 0;
  public lastPrompt: string | null = null;
  public lastWorkflowScript: string | null = null;
  public shouldSucceed = true;
  public fixedWorkflow: string | null = null;

  reset() {
    this.invokeCount = 0;
    this.lastPrompt = null;
    this.lastWorkflowScript = null;
    this.shouldSucceed = true;
    this.fixedWorkflow = null;
  }

  async invoke(prompt: string, workflowScript: string, context: any) {
    this.invokeCount++;
    this.lastPrompt = prompt;
    this.lastWorkflowScript = workflowScript;

    if (!this.shouldSucceed) {
      return {
        success: false,
        error: 'Mock adapter configured to fail',
      };
    }

    // Generate a fixed workflow
    const fixed = this.fixedWorkflow || this.generateFixedWorkflow(context);

    // Write the fixed workflow
    await Bun.write(workflowScript, fixed);

    return {
      success: true,
      patchedWorkflow: fixed,
    };
  }

  private generateFixedWorkflow(context: any): string {
    // Generate a minimal working workflow
    return `import { smithers, Workflow, Task, ClaudeCodeAgent } from "smithers-orchestrator";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sqliteTable, text, primaryKey } from "drizzle-orm/sqlite-core";

const outputTable = sqliteTable(
  "output",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    result: text("result").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

export const schema = { output: outputTable };
export const db = drizzle(".smithers/workflow.db", { schema });

(db as any).$client.exec(\`
  CREATE TABLE IF NOT EXISTS output (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    result TEXT NOT NULL,
    PRIMARY KEY (run_id, node_id)
  );
  CREATE TABLE IF NOT EXISTS state (
    key TEXT PRIMARY KEY, value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );
\`);

function updateState(key: string, value: string) {
  try {
    (db as any).$client.run(
      "INSERT OR REPLACE INTO state (key, value, updated_at) VALUES (?, ?, datetime('now'))",
      [key, value]
    );
  } catch (err) {
    console.error(\`Failed to update state "\${key}":\`, err);
  }
}

updateState("supervisor.status", "running");
updateState("supervisor.summary", "Auto-healed workflow");
updateState("supervisor.heartbeat", new Date().toISOString());

setInterval(() => {
  try {
    updateState("supervisor.heartbeat", new Date().toISOString());
  } catch (err) {
    console.error("Heartbeat failed:", err);
  }
}, 30000);

const agent = new ClaudeCodeAgent({
  model: "sonnet",
  env: { ANTHROPIC_API_KEY: "" },
});

export default smithers(db, (ctx) => {
  updateState("supervisor.status", "running");
  updateState("supervisor.summary", "Fixed workflow running");

  return (
    <Workflow name="fixed-workflow">
      <Task id="fixed-task" output={schema.output} agent={agent}>
        This is a fixed workflow after auto-heal.
      </Task>
    </Workflow>
  );
});

process.on("beforeExit", () => {
  try {
    updateState("supervisor.status", "done");
    updateState("supervisor.summary", "Workflow complete");
  } catch (err) {}
});
`;
  }
}
