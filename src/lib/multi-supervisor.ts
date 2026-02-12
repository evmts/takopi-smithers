import { Supervisor } from "./supervisor";
import { log } from "./logger";
import type { Worktree } from "./worktree";
import { listWorktrees, getWorktreeConfigPath } from "./worktree";
import { loadConfig } from "./config";
import { queryWorkflowState, isHeartbeatStale } from "./db";
import { existsSync } from "node:fs";

export interface WorktreeStatus {
  worktree: Worktree;
  status: string;
  summary: string;
  heartbeat: string | null;
  heartbeatOk: boolean;
  lastError: string | null;
}

export class MultiSupervisor {
  private supervisors: Map<string, Supervisor> = new Map();
  private dryRun: boolean;

  constructor(dryRun: boolean = false) {
    this.dryRun = dryRun;
  }

  /**
   * Start supervisors for all worktrees that have config files
   */
  async startAll(): Promise<void> {
    await log("Starting multi-supervisor for all configured worktrees...");

    const worktrees = await listWorktrees();
    const configuredWorktrees: Worktree[] = [];

    // Find all worktrees with config files
    for (const worktree of worktrees) {
      const configPath = getWorktreeConfigPath(worktree);
      const configExists = await Bun.file(configPath).exists();

      if (configExists) {
        configuredWorktrees.push(worktree);
      }
    }

    if (configuredWorktrees.length === 0) {
      console.log("No configured worktrees found. Run 'takopi-smithers init --worktree <name>' first.");
      return;
    }

    await log(`Found ${configuredWorktrees.length} configured worktree(s)`);

    // Start supervisor for each configured worktree
    for (const worktree of configuredWorktrees) {
      await this.startWorktree(worktree);
    }

    await log(`Started supervisors for ${this.supervisors.size} worktree(s)`);
  }

  /**
   * Start supervisor for a specific worktree
   */
  async startWorktree(worktree: Worktree): Promise<void> {
    const key = worktree.branch;

    if (this.supervisors.has(key)) {
      await log(`Supervisor for worktree '${key}' is already running`, "warn");
      return;
    }

    try {
      await log(`Starting supervisor for worktree: ${worktree.branch} (${worktree.path})`);

      // Load worktree-specific config
      const configPath = getWorktreeConfigPath(worktree);
      const config = await loadConfig(configPath);

      // Create and start supervisor
      const supervisor = new Supervisor(config, this.dryRun);
      await supervisor.start();

      this.supervisors.set(key, supervisor);
      await log(`Supervisor started for worktree '${key}'`);
    } catch (error) {
      await log(`Failed to start supervisor for worktree '${key}': ${error}`, "error");
      throw error;
    }
  }

  /**
   * Stop supervisor for a specific worktree
   */
  async stopWorktree(worktreeName: string, keepTakopi: boolean = true): Promise<void> {
    const supervisor = this.supervisors.get(worktreeName);

    if (!supervisor) {
      await log(`No supervisor running for worktree '${worktreeName}'`, "warn");
      return;
    }

    await log(`Stopping supervisor for worktree '${worktreeName}'...`);
    await supervisor.stop(keepTakopi);
    this.supervisors.delete(worktreeName);
    await log(`Supervisor stopped for worktree '${worktreeName}'`);
  }

  /**
   * Stop all running supervisors
   */
  async stopAll(keepTakopi: boolean = false): Promise<void> {
    await log("Stopping all supervisors...");

    const worktreeNames = Array.from(this.supervisors.keys());

    for (let i = 0; i < worktreeNames.length; i++) {
      const name = worktreeNames[i]!;
      // Keep Takopi running until the last supervisor is stopped
      const isLast = i === worktreeNames.length - 1;
      await this.stopWorktree(name, !isLast || keepTakopi);
    }

    await log("All supervisors stopped");
  }

  /**
   * Restart supervisor for a specific worktree
   */
  async restartWorktree(worktreeName: string): Promise<void> {
    const supervisor = this.supervisors.get(worktreeName);

    if (!supervisor) {
      await log(`No supervisor running for worktree '${worktreeName}'`, "warn");
      return;
    }

    await log(`Restarting supervisor for worktree '${worktreeName}'...`);
    await supervisor.restart();
    await log(`Supervisor restarted for worktree '${worktreeName}'`);
  }

  /**
   * Get status for all configured worktrees
   */
  async statusAll(): Promise<WorktreeStatus[]> {
    const worktrees = await listWorktrees();
    const statuses: WorktreeStatus[] = [];

    for (const worktree of worktrees) {
      const configPath = getWorktreeConfigPath(worktree);
      const configExists = await Bun.file(configPath).exists();

      if (!configExists) {
        continue; // Skip unconfigured worktrees
      }

      try {
        const config = await loadConfig(configPath);

        // Check if DB exists
        if (!existsSync(config.workflow.db)) {
          statuses.push({
            worktree,
            status: "not started",
            summary: "Workflow not started",
            heartbeat: null,
            heartbeatOk: false,
            lastError: null,
          });
          continue;
        }

        const state = queryWorkflowState(config.workflow.db);
        const heartbeatOk = state.heartbeat
          ? !isHeartbeatStale(state.heartbeat, config.health.hang_threshold_seconds)
          : false;

        statuses.push({
          worktree,
          status: state.status || "unknown",
          summary: state.summary || "No summary available",
          heartbeat: state.heartbeat || null,
          heartbeatOk,
          lastError: state.last_error || null,
        });
      } catch (error) {
        await log(`Failed to get status for worktree '${worktree.branch}': ${error}`, "warn");
        statuses.push({
          worktree,
          status: "error",
          summary: `Failed to read status: ${error}`,
          heartbeat: null,
          heartbeatOk: false,
          lastError: String(error),
        });
      }
    }

    return statuses;
  }

  /**
   * Get status for a specific worktree
   */
  async statusWorktree(worktreeName: string): Promise<WorktreeStatus | null> {
    const { findWorktreeByName } = await import("./worktree");
    const worktree = await findWorktreeByName(worktreeName);

    if (!worktree) {
      return null;
    }

    const configPath = getWorktreeConfigPath(worktree);
    const config = await loadConfig(configPath);

    if (!existsSync(config.workflow.db)) {
      return {
        worktree,
        status: "not started",
        summary: "Workflow not started",
        heartbeat: null,
        heartbeatOk: false,
        lastError: null,
      };
    }

    const state = queryWorkflowState(config.workflow.db);
    const heartbeatOk = state.heartbeat
      ? !isHeartbeatStale(state.heartbeat, config.health.hang_threshold_seconds)
      : false;

    return {
      worktree,
      status: state.status || "unknown",
      summary: state.summary || "No summary available",
      heartbeat: state.heartbeat || null,
      heartbeatOk,
      lastError: state.last_error || null,
    };
  }
}
