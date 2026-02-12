import { loadConfig, loadWorktreeConfig, getTelegramCredentials } from "../lib/config";
import { getPidFilePath, readPidFile, getAllWorktreePidFiles } from "../lib/pid";
import { log } from "../lib/logger";
import { sendTelegramMessage } from "../lib/telegram";
import { findWorktreeByName } from "../lib/worktree";
import { Database } from "bun:sqlite";

interface ResumeOptions {
  worktree?: string;
  allWorktrees?: boolean;
}

/**
 * Get pause state from workflow database
 */
function getPauseState(dbPath: string): { paused: boolean; pausedAt: string | null } {
  const db = new Database(dbPath, { readonly: true });
  try {
    const pausedRow = db
      .query<{ value: string }, []>("SELECT value FROM state WHERE key = 'supervisor.paused'")
      .get();

    const pausedAtRow = db
      .query<{ value: string }, []>("SELECT value FROM state WHERE key = 'supervisor.paused_at'")
      .get();

    return {
      paused: pausedRow?.value === "true",
      pausedAt: pausedAtRow?.value || null,
    };
  } finally {
    db.close();
  }
}

/**
 * Clear pause state from workflow database
 */
function clearPauseState(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    db.run(
      "INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)",
      ["supervisor.paused", "false"]
    );
    db.run("DELETE FROM state WHERE key = ?", ["supervisor.paused_at"]);

    // Reset restart attempts counter
    db.run(
      "INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)",
      ["supervisor.restart_count", "0"]
    );
  } finally {
    db.close();
  }
}

/**
 * Send Telegram notification about resume
 */
async function sendResumeNotification(
  config: any,
  pauseDuration: string | null,
  dryRun: boolean = false
): Promise<void> {
  try {
    const credentials = await getTelegramCredentials(config);
    if (!credentials) return;

    const timestamp = new Date().toISOString();
    const repoName = process.cwd().split("/").pop() || "unknown";
    const branchProc = Bun.spawnSync(["git", "branch", "--show-current"]);
    const branch = branchProc.stdout?.toString().trim() || "unknown";

    let message = `▶️ **Workflow Resumed**\n\nRepo: \`${repoName}\` (${branch})\nTimestamp: ${timestamp}\n`;

    if (pauseDuration) {
      message += `\nPaused for: ${pauseDuration}\n`;
    }

    message += `\nThe Smithers workflow has been resumed.`;

    await sendTelegramMessage(
      credentials.botToken,
      credentials.chatId,
      message,
      dryRun,
      credentials.messageThreadId
    );
  } catch (error) {
    await log(`Failed to send resume notification: ${error}`, "warn");
  }
}

/**
 * Calculate pause duration in human-readable format
 */
function formatPauseDuration(pausedAt: string): string {
  try {
    const pauseTime = new Date(pausedAt).getTime();
    const now = Date.now();
    const durationSeconds = Math.floor((now - pauseTime) / 1000);

    if (durationSeconds < 60) {
      return `${durationSeconds} second${durationSeconds !== 1 ? 's' : ''}`;
    } else if (durationSeconds < 3600) {
      const minutes = Math.floor(durationSeconds / 60);
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else if (durationSeconds < 86400) {
      const hours = Math.floor(durationSeconds / 3600);
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    } else {
      const days = Math.floor(durationSeconds / 86400);
      return `${days} day${days !== 1 ? 's' : ''}`;
    }
  } catch {
    return "unknown duration";
  }
}

/**
 * Resume a single workflow
 */
async function resumeSingleWorkflow(
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

  // Check if workflow is paused
  const { paused, pausedAt } = getPauseState(config.workflow.db);

  if (!paused) {
    const target = worktreeName ? ` for worktree '${worktreeName}'` : "";
    console.log(`⚠️  Workflow is not paused${target}`);
    console.log("Use 'takopi-smithers status' to check current state");
    return;
  }

  await log("Resuming workflow...");

  // Calculate pause duration
  const pauseDuration = pausedAt ? formatPauseDuration(pausedAt) : null;

  // Clear pause state in database
  clearPauseState(config.workflow.db);

  // Send Telegram notification
  await sendResumeNotification(config, pauseDuration);

  // Send SIGUSR1 signal to supervisor to trigger restart
  // This will restart Smithers process since pause flag is now cleared
  process.kill(pid, "SIGUSR1");

  await log("Workflow resumed. Supervisor will restart Smithers process.");

  console.log("✅ Workflow resumed successfully");
  if (pauseDuration) {
    console.log(`   Paused for: ${pauseDuration}`);
  }
}

/**
 * Resume all paused worktree workflows
 */
async function resumeAllWorktrees(): Promise<void> {
  await log("Resuming all paused worktree workflows...");

  const pidFiles = await getAllWorktreePidFiles();
  const resumedWorktrees: string[] = [];
  let pausedCount = 0;

  for (const { worktree, pidPath, pid } of pidFiles) {
    if (!pid) {
      continue; // Skip worktrees with no running supervisor
    }

    try {
      const config = await loadWorktreeConfig(worktree.branch);

      // Check if workflow is paused
      const { paused, pausedAt } = getPauseState(config.workflow.db);

      if (!paused) {
        continue; // Skip non-paused workflows
      }

      pausedCount++;

      console.log(`▶️  Resuming workflow for worktree: ${worktree.branch}`);

      // Calculate pause duration
      const pauseDuration = pausedAt ? formatPauseDuration(pausedAt) : null;

      // Clear pause state in database
      clearPauseState(config.workflow.db);

      // Send Telegram notification
      await sendResumeNotification(config, pauseDuration);

      // Send SIGUSR1 signal to supervisor to trigger restart
      process.kill(pid, "SIGUSR1");

      resumedWorktrees.push(worktree.branch);
      console.log(`✅ Resumed workflow for '${worktree.branch}'`);
    } catch (error) {
      console.error(`❌ Failed to resume workflow for '${worktree.branch}':`, error);
    }
  }

  if (pausedCount === 0) {
    console.log("\n⚠️  No paused workflows found");
    return;
  }

  console.log(`\n✅ Resumed ${resumedWorktrees.length}/${pausedCount} workflow(s)`);
  if (resumedWorktrees.length > 0) {
    console.log(`   Worktrees: ${resumedWorktrees.join(", ")}`);
  }
}

/**
 * Resume workflow for a specific worktree
 */
async function resumeSpecificWorktree(worktreeName: string): Promise<void> {
  const worktree = await findWorktreeByName(worktreeName);

  if (!worktree) {
    console.log(`⚠️  Worktree '${worktreeName}' not found`);
    return;
  }

  const config = await loadWorktreeConfig(worktreeName);
  await resumeSingleWorkflow(config, worktreeName);
}

export async function resume(options: ResumeOptions = {}): Promise<void> {
  try {
    // Handle --all-worktrees flag
    if (options.allWorktrees) {
      await resumeAllWorktrees();
      return;
    }

    // Handle --worktree <name> flag
    if (options.worktree) {
      await resumeSpecificWorktree(options.worktree);
      return;
    }

    // Resume single workflow (default behavior)
    const config = await loadConfig();
    await resumeSingleWorkflow(config);
  } catch (error) {
    console.error("Failed to resume workflow:", error);
    // In test environments, throw instead of exiting
    if (process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test') {
      throw error;
    }
    process.exit(1);
  }
}
