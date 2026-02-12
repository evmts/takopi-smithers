import { loadConfig, loadWorktreeConfig } from "../lib/config";
import { getPidFilePath, readPidFile, getAllWorktreePidFiles } from "../lib/pid";
import { log } from "../lib/logger";
import { findWorktreeByName } from "../lib/worktree";

interface RestartOptions {
  worktree?: string;
  allWorktrees?: boolean;
}

/**
 * Restart all running worktree supervisors
 */
async function restartAllWorktrees(): Promise<void> {
  await log("Restarting all worktree supervisors...");

  const pidFiles = await getAllWorktreePidFiles();
  const restartedWorktrees: string[] = [];
  let runningCount = 0;

  for (const { worktree, pidPath, pid } of pidFiles) {
    if (!pid) {
      continue; // Skip worktrees with no running supervisor
    }

    runningCount++;

    try {
      console.log(`🔄 Restarting supervisor for worktree: ${worktree.branch} (PID: ${pid})`);
      process.kill(pid, "SIGUSR1");
      restartedWorktrees.push(worktree.branch);
      console.log(`✅ Restart signal sent to '${worktree.branch}'`);
    } catch (error) {
      console.error(`❌ Failed to restart supervisor for '${worktree.branch}':`, error);
    }
  }

  if (runningCount === 0) {
    console.log("\n⚠️  No running supervisors found");
    console.log("Start supervisors first: takopi-smithers start --all-worktrees");
    return;
  }

  console.log(`\n✅ Restarted ${restartedWorktrees.length}/${runningCount} supervisor(s)`);
  if (restartedWorktrees.length > 0) {
    console.log(`   Worktrees: ${restartedWorktrees.join(", ")}`);
  }
}

/**
 * Restart supervisor for a specific worktree by name
 */
async function restartSpecificWorktree(worktreeName: string): Promise<void> {
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
    console.log(`Start the supervisor first: takopi-smithers start --worktree ${worktreeName}`);
    return;
  }

  await log(`Sending restart signal to supervisor for worktree '${worktreeName}'...`);

  // Send SIGUSR1 to supervisor process (handled in start.ts)
  process.kill(pid, "SIGUSR1");

  await log(`Restart signal sent to worktree '${worktreeName}'`);
}

export async function restart(options: RestartOptions = {}): Promise<void> {
  try {
    // Handle --all-worktrees flag
    if (options.allWorktrees) {
      await restartAllWorktrees();
      return;
    }

    // Handle --worktree <name> flag
    if (options.worktree) {
      await restartSpecificWorktree(options.worktree);
      return;
    }

    // Restart single supervisor (existing behavior)
    const config = await loadConfig();
    const pidPath = getPidFilePath(config);
    const pid = readPidFile(pidPath);

    if (!pid) {
      console.log("⚠️  No running supervisor found");
      console.log("Start the supervisor first: takopi-smithers start");
      return;
    }

    await log("Sending restart signal to supervisor...");

    // Send SIGUSR1 to supervisor process (handled in start.ts)
    process.kill(pid, "SIGUSR1");

    await log("Restart signal sent");
  } catch (error) {
    console.error("Failed to restart:", error);
    // In test environments, throw instead of exiting
    if (process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test') {
      throw error;
    }
    process.exit(1);
  }
}
