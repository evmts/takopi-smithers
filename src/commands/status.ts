import { loadConfig, loadWorktreeConfig } from "../lib/config";
import { queryWorkflowState, isHeartbeatStale } from "../lib/db";
import { getPidFilePath, readPidFile } from "../lib/pid";

interface StatusOptions {
  json?: boolean;
  worktree?: string;
}

export async function status(options: StatusOptions = {}): Promise<void> {
  try {
    const config = options.worktree
      ? await loadWorktreeConfig(options.worktree)
      : await loadConfig();
    const state = queryWorkflowState(config.workflow.db);
    const pidPath = getPidFilePath(config);
    const pid = readPidFile(pidPath);

    const heartbeatOk = !isHeartbeatStale(
      state.heartbeat,
      config.health.hang_threshold_seconds
    );

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            pid,
            status: state.status,
            summary: state.summary,
            heartbeat: state.heartbeat,
            heartbeatOk,
          },
          null,
          2
        )
      );
    } else {
      console.log("\n📊 takopi-smithers Status\n");
      console.log(`PID:          ${pid || "Not running"}`);
      console.log(`Status:       ${state.status || "unknown"}`);
      console.log(`Summary:      ${state.summary || "No summary available"}`);
      console.log(`Heartbeat:    ${state.heartbeat || "No heartbeat"}`);
      console.log(`Heartbeat OK: ${heartbeatOk ? "✅ OK" : "❌ Stale"}`);
      console.log();
    }
  } catch (error) {
    console.error("Failed to get status:", error);
    process.exit(1);
  }
}
