import * as TOML from '@iarna/toml';
import { findWorktreeByName, getWorktreeConfigPath, getWorktreeDbPath, getWorktreeWorkflowPath, getWorktreeLogsPath } from '../lib/worktree';
import { WORKFLOW_TEMPLATE } from './workflow-template';

interface InitOptions {
  force?: boolean;
  worktree?: string;
}

export async function init(options: InitOptions = {}): Promise<void> {
  console.log('Initializing takopi-smithers...');

  // Check if we're in a git repo (check for .git/config file which exists in all git repos)
  const gitConfigExists = await Bun.file('.git/config').exists();
  const gitFileExists = await Bun.file('.git').exists();
  if (!gitConfigExists && !gitFileExists) {
    console.error('Error: Must be run from a git repository root');
    process.exit(1);
  }

  // Handle worktree-specific initialization
  if (options.worktree) {
    await initWorktree(options.worktree, options);
    return;
  }

  // Create directories
  await ensureDir('.takopi-smithers');
  await ensureDir('.smithers');

  // Track what we created/skipped
  const results = {
    created: [] as string[],
    skipped: [] as string[],
    backed_up: [] as string[],
  };

  // Create config.toml
  await createConfigToml(options.force, results);

  // Create workflow.tsx
  await createWorkflowTemplate(options.force, results);

  // Create TAKOPI_SMITHERS.md
  await createTakopiSmithersMd(options.force, results);

  // Create CLAUDE.md
  await createClaudeMd(options.force, results);

  // Create AGENTS.md
  await createAgentsMd(options.force, results);

  // Check for smithers-orchestrator dependency
  await checkSmithersDependency();

  // Print summary
  printSummary(results);

  console.log('\n✅ Initialization complete!');
  console.log('\nNext steps:');
  console.log('  1. Configure Takopi: takopi --onboard (if not already done)');
  console.log('  2. Start the supervisor: bunx takopi-smithers start');
}

async function ensureDir(path: string): Promise<void> {
  const exists = await Bun.file(path).exists();
  if (!exists) {
    await Bun.write(`${path}/.gitkeep`, '');
  }
}

async function createConfigToml(
  force: boolean | undefined,
  results: { created: string[]; skipped: string[]; backed_up: string[] }
): Promise<void> {
  const path = '.takopi-smithers/config.toml';
  const exists = await Bun.file(path).exists();

  if (exists && !force) {
    results.skipped.push(path);
    return;
  }

  if (exists && force) {
    // Backup existing file
    const backupPath = `${path}.bak.${Date.now()}`;
    const existing = await Bun.file(path).text();
    await Bun.write(backupPath, existing);
    results.backed_up.push(backupPath);
  }

  const config = {
    version: 1,
    workflow: {
      script: '.smithers/workflow.tsx',
      db: '.smithers/workflow.db',
      // input: { specPath: 'SPEC.md' },
    },
    updates: {
      enabled: true,
      interval_seconds: 600, // 10 minutes
    },
    health: {
      heartbeat_key: 'supervisor.heartbeat',
      heartbeat_write_interval_seconds: 30,
      hang_threshold_seconds: 300,
      restart_backoff_seconds: [5, 30, 120, 600],
      max_restart_attempts: 20,
    },
    telegram: {
      bot_token: '',
      chat_id: 0,
    },
    autoheal: {
      enabled: true,
      engine: 'claude',
      max_attempts: 3,
    },
  };

  const tomlString = TOML.stringify(config as any);
  await Bun.write(path, tomlString);
  results.created.push(path);
}

async function createWorkflowTemplate(
  force: boolean | undefined,
  results: { created: string[]; skipped: string[]; backed_up: string[] }
): Promise<void> {
  const path = '.smithers/workflow.tsx';
  const exists = await Bun.file(path).exists();

  if (exists && !force) {
    results.skipped.push(path);
    return;
  }

  if (exists && force) {
    const backupPath = `${path}.bak.${Date.now()}`;
    const existing = await Bun.file(path).text();
    await Bun.write(backupPath, existing);
    results.backed_up.push(backupPath);
  }

  const template = WORKFLOW_TEMPLATE;

  await Bun.write(path, template);
  results.created.push(path);
}

async function createTakopiSmithersMd(
  force: boolean | undefined,
  results: { created: string[]; skipped: string[]; backed_up: string[] }
): Promise<void> {
  const path = 'TAKOPI_SMITHERS.md';
  const exists = await Bun.file(path).exists();

  if (exists && !force) {
    results.skipped.push(path);
    return;
  }

  if (exists && force) {
    const backupPath = `${path}.bak.${Date.now()}`;
    const existing = await Bun.file(path).text();
    await Bun.write(backupPath, existing);
    results.backed_up.push(backupPath);
  }

  const content = `# takopi-smithers operational rules

You are the Takopi supervisor for this repository.

Your job:
1) Maintain a long-running Smithers workflow in \`.smithers/workflow.tsx\`
2) Ensure it is resumable across restarts (use Smithers SQLite persistence)
3) Keep status visibility high via DB state keys used by the supervisor:
   - supervisor.status: "idle" | "running" | "error" | "done"
   - supervisor.summary: short human-readable summary (1–3 sentences)
   - supervisor.last_error: most recent failure details
4) When users request changes:
   - Prefer editing \`.smithers/workflow.tsx\` and/or \`.takopi-smithers/config.toml\`
   - Expect the runtime to restart the workflow automatically when the file changes

Smithers basics:
- Smithers is a React framework for orchestration. Plans are TSX.
- State is persisted in SQLite and survives restarts.
- You can resume incomplete executions via \`db.execution.findIncomplete()\`.

Docs:
- Smithers intro: https://smithers.sh/introduction
- MCP/SQLite tool pattern: https://smithers.sh/guides/mcp-integration

Takopi basics:
- Takopi runs your agent CLI in the repo and bridges to Telegram.
- Takopi config lives in ~/.takopi/takopi.toml
- Users can switch engines with /claude, /codex, /opencode, /pi

When workflow crashes or hangs:
- Diagnose using:
  - \`.takopi-smithers/logs/*\`
  - \`.smithers/workflow.tsx\`
  - SQLite state keys and execution history
- Patch the workflow to prevent recurrence (timeouts, retries, smaller steps)
- Keep the plan simple and observable (Phases/Steps/Tasks), and update supervisor.summary often.

Output style:
- Be explicit about what changed and why.
- Prefer robust, restart-friendly designs over cleverness.
`;

  await Bun.write(path, content);
  results.created.push(path);
}

async function createClaudeMd(
  force: boolean | undefined,
  results: { created: string[]; skipped: string[]; backed_up: string[] }
): Promise<void> {
  const path = 'CLAUDE.md';
  const exists = await Bun.file(path).exists();

  // Special handling for CLAUDE.md - check if it already has takopi-smithers content
  if (exists) {
    const existing = await Bun.file(path).text();
    if (existing.includes('TAKOPI_SMITHERS.md')) {
      results.skipped.push(path + ' (already configured)');
      return;
    }

    if (!force) {
      // Append to existing CLAUDE.md
      const addition = `\n\n# takopi-smithers configuration\n\n@TAKOPI_SMITHERS.md\n\nAdditional notes:\n- Workflow file: .smithers/workflow.tsx\n- Supervisor config: .takopi-smithers/config.toml\n`;
      await Bun.write(path, existing + addition);
      results.created.push(path + ' (appended)');
      return;
    }

    // Force mode: backup and replace
    const backupPath = `${path}.bak.${Date.now()}`;
    await Bun.write(backupPath, existing);
    results.backed_up.push(backupPath);
  }

  const content = `# Project memory (Claude Code)

@TAKOPI_SMITHERS.md

Additional notes:
- Workflow file: .smithers/workflow.tsx
- Supervisor config: .takopi-smithers/config.toml
`;

  await Bun.write(path, content);
  results.created.push(path);
}

async function createAgentsMd(
  force: boolean | undefined,
  results: { created: string[]; skipped: string[]; backed_up: string[] }
): Promise<void> {
  const path = 'AGENTS.md';
  const exists = await Bun.file(path).exists();

  if (exists) {
    const existing = await Bun.file(path).text();
    if (existing.includes('TAKOPI_SMITHERS.md')) {
      results.skipped.push(path + ' (already configured)');
      return;
    }

    if (!force) {
      // Append to existing AGENTS.md
      const addition = `\n\n# takopi-smithers instructions\n\nRead and follow: TAKOPI_SMITHERS.md\n\nKey paths:\n- .smithers/workflow.tsx\n- .takopi-smithers/config.toml\n`;
      await Bun.write(path, existing + addition);
      results.created.push(path + ' (appended)');
      return;
    }

    // Force mode: backup and replace
    const backupPath = `${path}.bak.${Date.now()}`;
    await Bun.write(backupPath, existing);
    results.backed_up.push(backupPath);
  }

  const content = `# takopi-smithers instructions for Codex

Read and follow: TAKOPI_SMITHERS.md

Key paths:
- .smithers/workflow.tsx
- .takopi-smithers/config.toml
`;

  await Bun.write(path, content);
  results.created.push(path);
}

async function checkSmithersDependency(): Promise<void> {
  // Check if smithers-orchestrator is installed by reading package.json
  const packageJsonExists = await Bun.file('package.json').exists();

  if (!packageJsonExists) {
    console.log('\n⚠️  package.json not found');
    console.log('\nTo install Smithers and AI SDK dependencies, run:');
    console.log('  bun add smithers-orchestrator zod ai @ai-sdk/anthropic');
    return;
  }

  try {
    const packageJson = await Bun.file('package.json').json();
    const hasSmithers =
      packageJson.dependencies?.['smithers-orchestrator'] ||
      packageJson.devDependencies?.['smithers-orchestrator'];
    const hasAI =
      packageJson.dependencies?.['ai'] || packageJson.devDependencies?.['ai'];
    const hasAnthropic =
      packageJson.dependencies?.['@ai-sdk/anthropic'] ||
      packageJson.devDependencies?.['@ai-sdk/anthropic'];

    const missing: string[] = [];
    if (!hasSmithers) missing.push('smithers-orchestrator');
    if (!hasAI) missing.push('ai');
    if (!hasAnthropic) missing.push('@ai-sdk/anthropic');

    if (missing.length === 0) {
      console.log('✓ All required dependencies found');
    } else {
      console.log(
        `\n⚠️  Missing dependencies: ${missing.join(', ')}`
      );
      console.log('\nTo install missing dependencies, run:');
      console.log(`  bun add ${missing.join(' ')}`);
    }
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.log('\n⚠️  Failed to parse package.json');
    } else {
      throw err;
    }
  }
}

function printSummary(results: {
  created: string[];
  skipped: string[];
  backed_up: string[];
}): void {
  console.log('\nSummary:');

  if (results.created.length > 0) {
    console.log('\n✓ Created:');
    results.created.forEach((f) => console.log(`  - ${f}`));
  }

  if (results.skipped.length > 0) {
    console.log('\n⊘ Skipped (already exists):');
    results.skipped.forEach((f) => console.log(`  - ${f}`));
  }

  if (results.backed_up.length > 0) {
    console.log('\n💾 Backed up:');
    results.backed_up.forEach((f) => console.log(`  - ${f}`));
  }
}

async function initWorktree(worktreeName: string, options: InitOptions): Promise<void> {
  console.log(`Initializing takopi-smithers for worktree: ${worktreeName}`);

  // Find the worktree
  const worktree = await findWorktreeByName(worktreeName);
  if (!worktree) {
    console.error(`Error: Worktree '${worktreeName}' not found`);
    console.log('\nAvailable worktrees:');
    const { listWorktrees } = await import('../lib/worktree');
    const worktrees = await listWorktrees();
    worktrees.forEach(wt => console.log(`  - ${wt.branch} (${wt.path})`));
    process.exit(1);
  }

  // Get worktree-specific paths
  const configPath = getWorktreeConfigPath(worktree);
  const dbPath = getWorktreeDbPath(worktree);
  const workflowPath = getWorktreeWorkflowPath(worktree);
  const logsPath = getWorktreeLogsPath(worktree);

  // Create worktree-specific directories
  const configDir = configPath.substring(0, configPath.lastIndexOf('/'));
  const dbDir = dbPath.substring(0, dbPath.lastIndexOf('/'));
  const workflowDir = workflowPath.substring(0, workflowPath.lastIndexOf('/'));

  await ensureDir(configDir);
  await ensureDir(dbDir);
  await ensureDir(workflowDir);
  await ensureDir(logsPath);

  const results = {
    created: [] as string[],
    skipped: [] as string[],
    backed_up: [] as string[],
  };

  // Create worktree-specific config.toml
  const configExists = await Bun.file(configPath).exists();
  if (configExists && !options.force) {
    results.skipped.push(configPath);
  } else {
    if (configExists && options.force) {
      const backupPath = `${configPath}.bak.${Date.now()}`;
      const existing = await Bun.file(configPath).text();
      await Bun.write(backupPath, existing);
      results.backed_up.push(backupPath);
    }

    // Create config with worktree-specific paths
    const config = {
      version: 1,
      workflow: {
        script: workflowPath,
        db: dbPath,
      },
      updates: {
        enabled: true,
        interval_seconds: 600,
      },
      health: {
        heartbeat_key: 'supervisor.heartbeat',
        heartbeat_write_interval_seconds: 30,
        hang_threshold_seconds: 300,
        restart_backoff_seconds: [5, 30, 120, 600],
        max_restart_attempts: 20,
      },
      telegram: {
        bot_token: '',
        chat_id: 0,
        // message_thread_id: 0, // Uncomment and set to route messages to specific Telegram topic
      },
      autoheal: {
        enabled: true,
        engine: 'claude',
        max_attempts: 3,
      },
      worktree: {
        name: worktreeName,
        branch: worktree.branch,
      },
    };

    const tomlString = TOML.stringify(config as any);
    await Bun.write(configPath, tomlString);
    results.created.push(configPath);
  }

  // Copy workflow template to worktree-specific path (or symlink to main one)
  const workflowExists = await Bun.file(workflowPath).exists();
  if (workflowExists && !options.force) {
    results.skipped.push(workflowPath);
  } else {
    if (workflowExists && options.force) {
      const backupPath = `${workflowPath}.bak.${Date.now()}`;
      const existing = await Bun.file(workflowPath).text();
      await Bun.write(backupPath, existing);
      results.backed_up.push(backupPath);
    }

    // Check if main workflow exists
    const mainWorkflowExists = await Bun.file('.smithers/workflow.tsx').exists();
    if (mainWorkflowExists) {
      // Copy main workflow as template
      const mainWorkflow = await Bun.file('.smithers/workflow.tsx').text();
      await Bun.write(workflowPath, mainWorkflow);
      results.created.push(workflowPath + ' (copied from main)');
    } else {
      // Create new workflow template
      const template = `import { createSmithers, Task } from "smithers-orchestrator";
import { ToolLoopAgent as Agent } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import Database from "bun:sqlite";

// Worktree: ${worktree.branch}
// This workflow is specific to the ${worktree.branch} worktree

const ExampleOutput = z.object({
  message: z.string(),
  timestamp: z.string(),
});

const { Workflow, smithers, tables } = createSmithers(
  {
    example: ExampleOutput,
  },
  { dbPath: "${dbPath}" }
);

const agent = new Agent({
  model: anthropic("claude-sonnet-4-20250514"),
  instructions: "You are a helpful assistant for the ${worktree.branch} branch.",
});

const db = new Database("${dbPath}");

db.run(\`
  CREATE TABLE IF NOT EXISTS state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  )
\`);

function updateState(key: string, value: string) {
  db.run(
    "INSERT OR REPLACE INTO state (key, value, updated_at) VALUES (?, ?, datetime('now'))",
    [key, value]
  );
}

updateState("supervisor.status", "running");
updateState("supervisor.summary", "Workflow initialized for ${worktree.branch}");
updateState("supervisor.heartbeat", new Date().toISOString());

if (typeof globalThis !== "undefined") {
  setInterval(() => {
    try {
      updateState("supervisor.heartbeat", new Date().toISOString());
    } catch (err) {
      console.error("Failed to write heartbeat:", err);
    }
  }, 30000);
}

export default smithers((ctx) => {
  updateState("supervisor.status", "running");
  updateState("supervisor.summary", "[${worktree.branch}] Workflow is executing");

  return (
    <Workflow name="${worktree.branch}-workflow">
      <Task id="example-task" output="example" agent={agent}>
        This is a placeholder task for the ${worktree.branch} worktree.
        Replace with your actual workflow logic.
      </Task>
    </Workflow>
  );
});

process.on("beforeExit", () => {
  try {
    updateState("supervisor.status", "done");
    updateState("supervisor.summary", "[${worktree.branch}] Workflow completed");
  } catch (err) {
    console.error("Failed to update final state:", err);
  }
});
`;
      await Bun.write(workflowPath, template);
      results.created.push(workflowPath);
    }
  }

  printSummary(results);

  console.log('\n✅ Worktree initialization complete!');
  console.log('\nNext steps:');
  console.log(`  1. Edit config: ${configPath}`);
  console.log(`     - Set Telegram message_thread_id if using topics`);
  console.log(`  2. Customize workflow: ${workflowPath}`);
  console.log(`  3. Start supervisor: bunx takopi-smithers start --worktree ${worktreeName}`);
}
