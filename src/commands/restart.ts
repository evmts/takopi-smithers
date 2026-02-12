import { loadConfig, loadWorktreeConfig } from "../lib/config";
import { getPidFilePath, readPidFile } from "../lib/pid";
import { log } from "../lib/logger";

interface RestartOptions {
  worktree?: string;
}

export async function restart(options: RestartOptions = {}): Promise<void> {
  try {
    const config = options.worktree
      ? await loadWorktreeConfig(options.worktree)
      : await loadConfig();
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
