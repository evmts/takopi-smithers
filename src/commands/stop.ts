import { loadConfig, loadWorktreeConfig } from "../lib/config";
import { getPidFilePath, readPidFile } from "../lib/pid";
import { log } from "../lib/logger";

interface StopOptions {
  keepTakopi?: boolean;
  worktree?: string;
}

export async function stop(options: StopOptions = {}): Promise<void> {
  try {
    const config = options.worktree
      ? await loadWorktreeConfig(options.worktree)
      : await loadConfig();
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
