import { loadConfig, loadWorktreeConfig, getTelegramCredentials } from "../lib/config";
import { getPidFilePath, readPidFile, getAllWorktreePidFiles } from "../lib/pid";
import { log } from "../lib/logger";
import { sendTelegramMessage } from "../lib/telegram";
import { findWorktreeByName } from "../lib/worktree";
import { Database } from "bun:sqlite";

interface PauseOptions {
  worktree?: string;
  allWorktrees?: boolean;
}

/**
 * Persist pause state to workflow database
 */
function setPauseState(dbPath: string, paused: boolean): void {
  const db = new Database(dbPath);
  try {
    const pauseValue = paused ? "true" : "false";
    const timestamp = new Date().toISOString();

    db.run(
      "INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)",
      ["supervisor.paused", pauseValue]
    );

    if (paused) {
      db.run(
        "INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)",
        ["supervisor.paused_at", timestamp]
      );
    } else {
      // Clear pause timestamp when resuming
      db.run("DELETE FROM state WHERE key = ?", ["supervisor.paused_at"]);
    }
  } finally {
    db.close();
  }
}

/**
 * Send Telegram notification about pause
 */
async function sendPauseNotification(
  config: any,
  dryRun: boolean = false
): Promise<void> {
  try {
    const credentials = await getTelegramCredentials(config);
    if (!credentials) return;

    const timestamp = new Date().toISOString();
    const repoName = process.cwd().split("/").pop() || "unknown";
    const branchProc = Bun.spawnSync(["git", "branch", "--show-current"]);
    const branch = branchProc.stdout?.toString().trim() || "unknown";

    const message = `⏸️ **Workflow Paused**\n\nRepo: \`${repoName}\` (${branch})\nTimestamp: ${timestamp}\n\nThe Smithers workflow has been paused. Supervisor remains active.\n\nUse \`takopi-smithers resume\` to continue.`;

    await sendTelegramMessage(
      credentials.botToken,
      credentials.chatId,
      message,
      dryRun,
      credentials.messageThreadId
    );
  } catch (error) {
    await log(`Failed to send pause notification: ${error}`, "warn");
  }
}

/**
 * Pause a single workflow
 */
async function pauseSingleWorkflow(
  config: any,
  worktreeName?: string
): Promise<void> {
  const pidPath = getPidFilePath(config);
  const pid = readPidFile(pidPath);

  if (!pid) {
    const target = worktreeName ? ` for worktree '${worktreeName}'` : "";
    console.log(`⚠️  No running supervisor found${target}`);
    console.log(`Start the supervisor first: takopi-smithers start${worktreeName ? ` --worktree ${worktreeName}` : ""}`);
    return;
  }

  await log("Pausing workflow...");

  // Set pause state in database
  setPauseState(config.workflow.db, true);

  // Send Telegram notification
  await sendPauseNotification(config);

  // Note: We don't kill the Smithers process here
  // The supervisor's health check will respect the pause state
  await log("Workflow paused. Supervisor will stop auto-restart and health checks.");
  await log("Use 'takopi-smithers resume' to continue the workflow.");

  console.log("✅ Workflow paused successfully");
}

/**
 * Pause all running worktree workflows
 */
async function pauseAllWorktrees(): Promise<void> {
  await log("Pausing all worktree workflows...");

  const pidFiles = await getAllWorktreePidFiles();
  const pausedWorktrees: string[] = [];
  let runningCount = 0;

  for (const { worktree, pidPath, pid } of pidFiles) {
    if (!pid) {
      continue; // Skip worktrees with no running supervisor
    }

    runningCount++;

    try {
      console.log(`⏸️  Pausing workflow for worktree: ${worktree.branch}`);
      const config = await loadWorktreeConfig(worktree.branch);

      // Set pause state in database
      setPauseState(config.workflow.db, true);

      // Send Telegram notification
      await sendPauseNotification(config);

      pausedWorktrees.push(worktree.branch);
      console.log(`✅ Paused workflow for '${worktree.branch}'`);
    } catch (error) {
      console.error(`❌ Failed to pause workflow for '${worktree.branch}':`, error);
    }
  }

  if (runningCount === 0) {
    console.log("\n⚠️  No running supervisors found");
    console.log("Start supervisors first: takopi-smithers start --all-worktrees");
    return;
  }

  console.log(`\n✅ Paused ${pausedWorktrees.length}/${runningCount} workflow(s)`);
  if (pausedWorktrees.length > 0) {
    console.log(`   Worktrees: ${pausedWorktrees.join(", ")}`);
  }
}

/**
 * Pause workflow for a specific worktree
 */
async function pauseSpecificWorktree(worktreeName: string): Promise<void> {
  const worktree = await findWorktreeByName(worktreeName);

  if (!worktree) {
    console.log(`⚠️  Worktree '${worktreeName}' not found`);
    return;
  }

  const config = await loadWorktreeConfig(worktreeName);
  await pauseSingleWorkflow(config, worktreeName);
}

export async function pause(options: PauseOptions = {}): Promise<void> {
  try {
    // Handle --all-worktrees flag
    if (options.allWorktrees) {
      await pauseAllWorktrees();
      return;
    }

    // Handle --worktree <name> flag
    if (options.worktree) {
      await pauseSpecificWorktree(options.worktree);
      return;
    }

    // Pause single workflow (default behavior)
    const config = await loadConfig();
    await pauseSingleWorkflow(config);
  } catch (error) {
    console.error("Failed to pause workflow:", error);
    // In test environments, throw instead of exiting
    if (process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test') {
      throw error;
    }
    process.exit(1);
  }
}
