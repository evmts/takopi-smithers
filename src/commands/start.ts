import { loadConfig, loadWorktreeConfig } from "../lib/config";
import { Supervisor } from "../lib/supervisor";
import { log } from "../lib/logger";
import { writePidFile, getPidFilePath, deletePidFile } from "../lib/pid";

interface StartOptions {
  dryRun?: boolean;
  worktree?: string;
}

export async function start(options: StartOptions = {}): Promise<void> {
  try {
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
