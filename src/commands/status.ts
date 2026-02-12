import { loadConfig, loadWorktreeConfig } from "../lib/config";
import {
  queryWorkflowState,
  isHeartbeatStale,
  getHeartbeatAge,
  formatHeartbeatAge,
  getWorkflowProgress,
} from "../lib/db";
import { getPidFilePath, readPidFile, getAllWorktreePidFiles } from "../lib/pid";
import { listWorktrees, getWorktreeConfigPath } from "../lib/worktree";
import * as fs from "node:fs";

interface StatusOptions {
  json?: boolean;
  worktree?: string;
  allWorktrees?: boolean;
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

/**
 * Display status for all configured worktrees in a table format
 */
async function statusAllWorktrees(json: boolean): Promise<void> {
  const worktrees = await listWorktrees();
  const statuses: Array<{
    name: string;
    branch: string;
    status: string;
    heartbeat: string;
    summary: string;
    pid: number | null;
  }> = [];

  for (const worktree of worktrees) {
    const configPath = getWorktreeConfigPath(worktree);
    const configExists = await Bun.file(configPath).exists();

    if (!configExists) {
      continue; // Skip unconfigured worktrees
    }

    try {
      const config = await loadConfig(configPath);
      const pidPath = getPidFilePath(config);
      const pid = readPidFile(pidPath);

      // Check if DB exists
      if (!fs.existsSync(config.workflow.db)) {
        statuses.push({
          name: worktree.branch,
          branch: worktree.branch,
          status: "not started",
          heartbeat: "—",
          summary: "Workflow not started",
          pid,
        });
        continue;
      }

      const state = queryWorkflowState(config.workflow.db);
      const heartbeatAge = getHeartbeatAge(config.workflow.db);
      const heartbeatOk = state.heartbeat
        ? !isHeartbeatStale(state.heartbeat, config.health.hang_threshold_seconds)
        : false;

      const heartbeatDisplay = heartbeatAge !== null
        ? formatHeartbeatAge(heartbeatAge) + (heartbeatOk ? " ✅" : " ❌")
        : "No heartbeat ❌";

      statuses.push({
        name: worktree.branch,
        branch: worktree.branch,
        status: state.status || "unknown",
        heartbeat: heartbeatDisplay,
        summary: state.summary || "No summary available",
        pid,
      });
    } catch (error) {
      statuses.push({
        name: worktree.branch,
        branch: worktree.branch,
        status: "error",
        heartbeat: "—",
        summary: `Failed to read status: ${error}`,
        pid: null,
      });
    }
  }

  if (statuses.length === 0) {
    console.log("⚠️  No configured worktrees found. Run 'takopi-smithers init --worktree <name>' first.");
    return;
  }

  if (json) {
    console.log(JSON.stringify(statuses, null, 2));
  } else {
    // Display table
    console.log("\n╔══════════════════════════════════════════════════════════════════════════════╗");
    console.log("║  takopi-smithers status - All Worktrees");
    console.log("╚══════════════════════════════════════════════════════════════════════════════╝\n");

    // Table header
    console.log("┌─────────────────────┬──────────────┬──────────────────┬─────────────────────────────┐");
    console.log("│ Worktree            │ Status       │ Heartbeat        │ Summary                     │");
    console.log("├─────────────────────┼──────────────┼──────────────────┼─────────────────────────────┤");

    // Table rows
    for (const s of statuses) {
      const name = s.name.padEnd(19).substring(0, 19);
      const status = s.status.padEnd(12).substring(0, 12);
      const heartbeat = s.heartbeat.padEnd(16).substring(0, 16);
      const summary = s.summary.padEnd(27).substring(0, 27);

      console.log(`│ ${name} │ ${status} │ ${heartbeat} │ ${summary} │`);
    }

    console.log("└─────────────────────┴──────────────┴──────────────────┴─────────────────────────────┘\n");

    // Summary
    const running = statuses.filter(s => s.pid !== null).length;
    console.log(`📊 ${statuses.length} configured worktree(s), ${running} supervisor(s) running\n`);
  }
}

export async function status(options: StatusOptions = {}): Promise<void> {
  try {
    // Handle --all-worktrees flag
    if (options.allWorktrees) {
      await statusAllWorktrees(options.json || false);
      return;
    }

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
