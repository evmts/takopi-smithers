import { loadConfig, loadWorktreeConfig } from "../lib/config";
import { Supervisor } from "../lib/supervisor";
import { log } from "../lib/logger";
import { writePidFile, getPidFilePath, deletePidFile, getWorktreePidFilePath } from "../lib/pid";
import { listWorktrees, getWorktreeConfigPath } from "../lib/worktree";
import { spawn } from "node:child_process";
import * as path from "node:path";

interface StartOptions {
  dryRun?: boolean;
  worktree?: string;
  allWorktrees?: boolean;
}

/**
 * Start a supervisor for a single worktree in a separate process
 */
async function startWorktreeInProcess(worktreeName: string, dryRun: boolean): Promise<number> {
  const scriptPath = path.join(import.meta.dir, "../cli.ts");

  const args = ["start", "--worktree", worktreeName];
  if (dryRun) {
    args.push("--dry-run");
  }

  const child = spawn("bun", [scriptPath, ...args], {
    detached: true,
    stdio: "inherit",
    cwd: process.cwd(),
  });

  // Detach the child process so it continues running after parent exits
  child.unref();

  // Handle undefined PID explicitly
  if (child.pid === undefined) {
    throw new Error(`Failed to spawn process for worktree '${worktreeName}' - no PID returned`);
  }

  return child.pid;
}

/**
 * Start supervisors for all configured worktrees
 */
async function startAllWorktrees(dryRun: boolean): Promise<void> {
  await log("Starting supervisors for all configured worktrees...");

  const worktrees = await listWorktrees();
  const startedWorktrees: string[] = [];
  let configuredCount = 0;

  for (const worktree of worktrees) {
    const configPath = getWorktreeConfigPath(worktree);
    const configExists = await Bun.file(configPath).exists();

    if (!configExists) {
      console.log(`⚠️  Skipping worktree '${worktree.branch}' - no config found at ${configPath}`);
      continue;
    }

    configuredCount++;

    try {
      console.log(`🚀 Starting supervisor for worktree: ${worktree.branch}`);
      const pid = await startWorktreeInProcess(worktree.branch, dryRun);

      if (pid > 0) {
        const pidPath = getWorktreePidFilePath(worktree);
        writePidFile(pidPath, pid);
        startedWorktrees.push(worktree.branch);
        console.log(`✅ Started supervisor for '${worktree.branch}' (PID: ${pid})`);
      } else {
        console.log(`❌ Failed to start supervisor for '${worktree.branch}' - no PID returned`);
      }
    } catch (error) {
      console.error(`❌ Failed to start supervisor for '${worktree.branch}':`, error);
    }
  }

  if (configuredCount === 0) {
    console.log("\n⚠️  No configured worktrees found. Run 'takopi-smithers init --worktree <name>' first.");
    return;
  }

  console.log(`\n✅ Started ${startedWorktrees.length}/${configuredCount} supervisor(s)`);
  if (startedWorktrees.length > 0) {
    console.log(`   Worktrees: ${startedWorktrees.join(", ")}`);
  }
}

export async function start(options: StartOptions = {}): Promise<void> {
  try {
    // Handle --all-worktrees flag
    if (options.allWorktrees) {
      await startAllWorktrees(options.dryRun || false);
      return;
    }

    // Start single supervisor (existing behavior)
    const config = options.worktree
      ? await loadWorktreeConfig(options.worktree)
      : await loadConfig();
    const supervisor = new Supervisor(config, options.dryRun || false);

    // Write PID file
    const pidPath = getPidFilePath(config);
    writePidFile(pidPath, process.pid);

    await supervisor.start();

    // Clean up PID file on exit
    const cleanup = async () => {
      await supervisor.stop();
      deletePidFile(pidPath);
    };

    // Keep process alive
    process.on("SIGINT", async () => {
      await log("Received SIGINT, stopping...");
      await cleanup();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      await log("Received SIGTERM, stopping...");
      await cleanup();
      process.exit(0);
    });

    process.on("SIGUSR1", async () => {
      await log("Received SIGUSR1, restarting workflow...");
      await supervisor.restart();
      await log("Workflow restarted via signal");
    });
  } catch (error) {
    console.error("Failed to start supervisor:", error);
    process.exit(1);
  }
}
