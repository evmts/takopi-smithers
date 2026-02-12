import { loadConfig, loadWorktreeConfig } from "../lib/config";
import {
  queryWorkflowState,
  isHeartbeatStale,
  getHeartbeatAge,
  formatHeartbeatAge,
  getWorkflowProgress,
} from "../lib/db";
import { getPidFilePath, readPidFile } from "../lib/pid";
import * as fs from "node:fs";

interface StatusOptions {
  json?: boolean;
  worktree?: string;
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${seconds}s`;
  }
}

function getStatusIndicator(status: string | null, heartbeatOk: boolean): string {
  if (!status) return "❌";

  if (status === "running" && heartbeatOk) return "✅";
  if (status === "running" && !heartbeatOk) return "⚠️";
  if (status === "completed") return "✅";
  if (status === "failed") return "❌";

  return "⚠️";
}

function isProcessRunning(pid: number | null): boolean {
  if (!pid) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getNextActionSuggestion(
  status: string | null,
  heartbeatOk: boolean,
  supervisorRunning: boolean
): string | null {
  if (!supervisorRunning) {
    return "Run 'takopi-smithers start' to start the supervisor";
  }

  if (!heartbeatOk) {
    return "Heartbeat is stale - workflow may be hung. Check logs with 'takopi-smithers logs'";
  }

  if (status === "failed") {
    return "Workflow failed - check logs with 'takopi-smithers logs --level error'";
  }

  return null;
}

export async function status(options: StatusOptions = {}): Promise<void> {
  try {
    const config = options.worktree
      ? await loadWorktreeConfig(options.worktree)
      : await loadConfig();
    const state = queryWorkflowState(config.workflow.db);
    const pidPath = getPidFilePath(config);
    const pid = readPidFile(pidPath);
    const progress = getWorkflowProgress(config.workflow.db);

    const heartbeatOk = !isHeartbeatStale(
      state.heartbeat,
      config.health.hang_threshold_seconds
    );

    const heartbeatAge = getHeartbeatAge(config.workflow.db);
    const supervisorRunning = isProcessRunning(pid);

    // Calculate uptime from supervisor start
    let uptime = 0;
    if (supervisorRunning && fs.existsSync(pidPath)) {
      try {
        const stats = fs.statSync(pidPath);
        uptime = Math.floor((Date.now() - stats.mtimeMs) / 1000);
      } catch {
        // Ignore errors
      }
    }

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            pid,
            status: state.status,
            summary: state.summary,
            heartbeat: state.heartbeat,
            heartbeatOk,
            heartbeatAgeSeconds: heartbeatAge,
            supervisorRunning,
            restarts: progress.restarts,
            autoheals: progress.autoheals,
            uptimeSeconds: uptime,
          },
          null,
          2
        )
      );
    } else {
      // Enhanced formatted output
      console.log("\n╔══════════════════════════════════════════════════════════╗");
      console.log("║  takopi-smithers status");
      console.log("╚══════════════════════════════════════════════════════════╝\n");

      // Workflow Status Section
      const statusIndicator = getStatusIndicator(state.status, heartbeatOk);
      console.log("🔹 Workflow Status");
      console.log(`   Status:    ${state.status || "unknown"} ${statusIndicator}`);
      console.log(`   Summary:   ${state.summary || "No summary available"}`);

      if (heartbeatAge !== null) {
        const ageStr = formatHeartbeatAge(heartbeatAge);
        const ageIndicator = heartbeatOk ? "✅" : "❌";
        console.log(`   Heartbeat: ${ageStr} ${ageIndicator}`);
      } else {
        console.log(`   Heartbeat: No heartbeat ❌`);
      }

      console.log();

      // Process Health Section
      console.log("🔹 Process Health");
      const supervisorIndicator = supervisorRunning ? "✅" : "❌";
      console.log(`   Supervisor: ${supervisorRunning ? `running (PID ${pid})` : "not running"} ${supervisorIndicator}`);
      console.log();

      // Supervisor Stats Section
      console.log("🔹 Supervisor Stats");
      console.log(`   Restarts:    ${progress.restarts}`);
      console.log(`   Auto-heals:  ${progress.autoheals}`);
      if (supervisorRunning && uptime > 0) {
        console.log(`   Uptime:      ${formatUptime(uptime)}`);
      }
      console.log();

      // Next Action (if needed)
      const nextAction = getNextActionSuggestion(state.status, heartbeatOk, supervisorRunning);
      if (nextAction) {
        console.log("💡 Next Action");
        console.log(`   ${nextAction}`);
        console.log();
      }
    }
  } catch (error) {
    console.error("Failed to get status:", error);
    process.exit(1);
  }
}
