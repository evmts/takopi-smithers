import { loadConfig, loadWorktreeConfig } from "../lib/config";
import { getPidFilePath, readPidFile, getAllWorktreePidFiles } from "../lib/pid";
import { log } from "../lib/logger";
import { findWorktreeByName } from "../lib/worktree";

interface StopOptions {
  keepTakopi?: boolean;
  worktree?: string;
  allWorktrees?: boolean;
}

/**
 * Stop all running worktree supervisors
 */
async function stopAllWorktrees(keepTakopi: boolean): Promise<void> {
  await log("Stopping all worktree supervisors...");

  const pidFiles = await getAllWorktreePidFiles();
  const stoppedWorktrees: string[] = [];
  let runningCount = 0;

  for (const { worktree, pidPath, pid } of pidFiles) {
    if (!pid) {
      continue; // Skip worktrees with no running supervisor
    }

    runningCount++;

    try {
      console.log(`🛑 Stopping supervisor for worktree: ${worktree.branch} (PID: ${pid})`);
      process.kill(pid, "SIGTERM");
      stoppedWorktrees.push(worktree.branch);
      console.log(`✅ Stopped supervisor for '${worktree.branch}'`);
    } catch (error) {
      console.error(`❌ Failed to stop supervisor for '${worktree.branch}':`, error);
    }
  }

  if (runningCount === 0) {
    console.log("\n⚠️  No running supervisors found");
    return;
  }

  console.log(`\n✅ Stopped ${stoppedWorktrees.length}/${runningCount} supervisor(s)`);
  if (stoppedWorktrees.length > 0) {
    console.log(`   Worktrees: ${stoppedWorktrees.join(", ")}`);
  }

  if (!keepTakopi) {
    await log("Note: Use --keep-takopi to keep Takopi processes running");
  }
}

/**
 * Stop supervisor for a specific worktree by name
 */
async function stopSpecificWorktree(worktreeName: string, keepTakopi: boolean): Promise<void> {
  const worktree = await findWorktreeByName(worktreeName);

  if (!worktree) {
    console.log(`⚠️  Worktree '${worktreeName}' not found`);
    return;
  }

  const config = await loadWorktreeConfig(worktreeName);
  const pidPath = getPidFilePath(config);
  const pid = readPidFile(pidPath);

  if (!pid) {
    console.log(`⚠️  No running supervisor found for worktree '${worktreeName}'`);
    return;
  }

  await log(`Stopping supervisor for worktree '${worktreeName}'...`);

  if (keepTakopi) {
    await log("(Keeping Takopi running)");
  }

  // Send SIGTERM to supervisor process
  process.kill(pid, "SIGTERM");

  await log(`Supervisor stopped for worktree '${worktreeName}'`);
}

export async function stop(options: StopOptions = {}): Promise<void> {
  try {
    // Handle --all-worktrees flag
    if (options.allWorktrees) {
      await stopAllWorktrees(options.keepTakopi || false);
      return;
    }

    // Handle --worktree <name> flag
    if (options.worktree) {
      await stopSpecificWorktree(options.worktree, options.keepTakopi || false);
      return;
    }

    // Stop single supervisor (existing behavior)
    const config = await loadConfig();
    const pidPath = getPidFilePath(config);
    const pid = readPidFile(pidPath);

    if (!pid) {
      console.log("⚠️  No running supervisor found");
      return;
    }

    await log("Stopping supervisor...");

    if (options.keepTakopi) {
      await log("(Keeping Takopi running)");
    }

    // Send SIGTERM to supervisor process
    process.kill(pid, "SIGTERM");

    await log("Supervisor stopped");
  } catch (error) {
    console.error("Failed to stop supervisor:", error);
    // In test environments, throw instead of exiting
    if (process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test') {
      throw error;
    }
    process.exit(1);
  }
}
