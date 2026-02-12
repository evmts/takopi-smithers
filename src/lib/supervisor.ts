import type { Subprocess } from "bun";
import type { Config } from "./config";
import { log } from "./logger";
import { sendTelegramMessage, formatStatusMessage } from "./telegram";
import { queryWorkflowState, isHeartbeatStale, type WorkflowState } from "./db";
import { getTelegramCredentials } from "./config";
import { attemptAutoHeal } from "./autoheal";
import * as fs from "node:fs";

export class Supervisor {
  private config: Config;
  private takopiProc: Subprocess | null = null;
  private smithersProc: Subprocess | null = null;
  private updateInterval: Timer | null = null;
  private healthCheckInterval: Timer | null = null;
  private restartAttempts = 0;
  private autoHealAttempts = 0;
  private dryRun: boolean;
  private workflowWatcher: ReturnType<typeof fs.watch> | null = null;
  private workflowRestartDebounceTimer: Timer | null = null;
  private isHandlingHang = false;

  constructor(config: Config, dryRun: boolean = false) {
    this.config = config;
    this.dryRun = dryRun;
  }

  async start(): Promise<void> {
    await log("Starting supervisor...");

    // Start Takopi subprocess (skip in dry-run mode for testing)
    if (!this.dryRun) {
      await this.startTakopi();
    } else {
      await log("Skipping Takopi startup (dry-run mode)");
    }

    // Start Smithers workflow subprocess
    await this.startSmithers();

    // Start file watcher for workflow changes
    await this.startWorkflowWatcher();

    // Start periodic update cron
    if (this.config.updates.enabled) {
      await this.startUpdateCron();
    }

    // Start health check loop
    await this.startHealthCheck();

    await log("Supervisor started successfully");
  }

  private async resolveTakopiBin(): Promise<string> {
    // Prefer repo-local .venv/bin/takopi, fall back to PATH
    const localBin = `${process.cwd()}/.venv/bin/takopi`;
    if (await Bun.file(localBin).exists()) return localBin;
    return "takopi";
  }

  private async startTakopi(): Promise<void> {
    await log("Starting Takopi...");

    const takopiBin = await this.resolveTakopiBin();
    await log(`Using takopi binary: ${takopiBin}`);

    this.takopiProc = Bun.spawn([takopiBin], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "inherit",
      env: { ...process.env },
      onExit: async (proc, exitCode, signalCode) => {
        await log(`Takopi exited with code ${exitCode}, signal ${signalCode}`, "warn");
        // Note: We don't auto-restart Takopi in Milestone 2
      },
    });

    await log(`Takopi started with PID ${this.takopiProc.pid}`);
  }

  private async startSmithers(): Promise<void> {
    await log("Starting Smithers workflow...");

    const args = ["bunx", "smithers", "run", this.config.workflow.script];
    if (this.config.workflow.input) {
      args.push("--input", JSON.stringify(this.config.workflow.input));
    }

    this.smithersProc = Bun.spawn(
      args,
      {
        cwd: process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env },
        onExit: async (proc, exitCode: number | null, signalCode: number | null) => {
          await log(
            `Smithers exited with code ${exitCode}, signal ${signalCode}`,
            "error"
          );
          // Auto-restart logic (Milestone 2)
          await this.handleSmithersExit(exitCode, signalCode);
        },
      }
    );

    await log(`Smithers started with PID ${this.smithersProc.pid}`);
  }

  private async handleSmithersExit(
    exitCode: number | null,
    signalCode: number | null
  ): Promise<void> {
    // Log whether this was a crash or a hang
    const wasHung = this.isHandlingHang;
    if (wasHung) {
      await log('Smithers exit was triggered by hang detection', 'info');
      // Reset the hang flag now that the process has exited
      this.isHandlingHang = false;
    }

    // Check if we should attempt auto-heal
    const shouldAutoHeal =
      this.config.autoheal.enabled &&
      this.autoHealAttempts < this.config.autoheal.max_attempts;

    if (shouldAutoHeal) {
      await log(
        `Attempting auto-heal (${this.autoHealAttempts + 1}/${this.config.autoheal.max_attempts})...`
      );

      const healSuccess = await attemptAutoHeal(
        this.config,
        exitCode,
        signalCode,
        this.restartAttempts
      );

      this.autoHealAttempts++;

      if (healSuccess) {
        await log('Auto-heal successful! Resetting restart counter.');
        // Reset counters on successful heal
        this.restartAttempts = 0;
        this.autoHealAttempts = 0;

        // Notify via Telegram
        await this.sendAutoHealNotification(true);

        // Restart with healed workflow
        await this.startSmithers();
        return;
      } else {
        await log('Auto-heal failed. Falling back to normal restart logic.', 'warn');
        await this.sendAutoHealNotification(false);
      }
    } else if (this.config.autoheal.enabled && this.autoHealAttempts >= this.config.autoheal.max_attempts) {
      await log(
        `Auto-heal max attempts (${this.config.autoheal.max_attempts}) exceeded. Reverting to restart-only.`,
        'warn'
      );
    }

    // Normal restart logic with backoff
    if (this.restartAttempts >= this.config.health.max_restart_attempts) {
      await log('Max restart attempts exceeded. Stopping.', 'error');
      return;
    }

    const backoffSchedule = this.config.health.restart_backoff_seconds;
    const backoffIndex = Math.min(this.restartAttempts, backoffSchedule.length - 1);
    const delaySec = backoffSchedule[backoffIndex]!;

    await log(
      `Restarting Smithers in ${delaySec}s (attempt ${this.restartAttempts + 1}/${this.config.health.max_restart_attempts})...`
    );

    await new Promise((resolve) => setTimeout(resolve, delaySec * 1000));

    this.restartAttempts++;
    await this.startSmithers();
  }

  private async startWorkflowWatcher(): Promise<void> {
    await log(`Starting file watcher for ${this.config.workflow.script}`);

    try {
      this.workflowWatcher = fs.watch(
        this.config.workflow.script,
        { persistent: true },
        async (eventType, filename) => {
          await log(`File change detected: ${eventType} on ${filename || this.config.workflow.script}`);

          // Debounce: clear existing timer and set new one
          if (this.workflowRestartDebounceTimer) {
            clearTimeout(this.workflowRestartDebounceTimer);
          }

          this.workflowRestartDebounceTimer = setTimeout(async () => {
            await log('Debounce completed, restarting workflow due to file change...');
            await this.restartDueToFileChange();
          }, 2000); // 2 second debounce
        }
      );

      await log('File watcher started successfully');
    } catch (error) {
      await log(`Failed to start file watcher: ${error}`, 'error');
    }
  }

  private async restartDueToFileChange(): Promise<void> {
    await log('Restarting Smithers due to workflow file change...');

    // Reset restart attempts since this is a manual/file-triggered restart, not a crash
    this.restartAttempts = 0;
    this.autoHealAttempts = 0;

    // Kill existing process
    if (this.smithersProc && this.smithersProc.exitCode === null) {
      this.smithersProc.kill();
      await this.smithersProc.exited;
    }

    // Start new process
    await this.startSmithers();
    await log('Workflow restarted successfully after file change');

    // Optionally send Telegram notification
    await this.sendFileChangeNotification();
  }

  private async sendFileChangeNotification(): Promise<void> {
    try {
      const credentials = await getTelegramCredentials(this.config);
      if (!credentials) return;

      const message = `🔄 **Workflow Reloaded**\n\nThe workflow file \`${this.config.workflow.script}\` was modified and the Smithers process has been restarted.`;

      await sendTelegramMessage(
        credentials.botToken,
        credentials.chatId,
        message,
        this.dryRun,
        credentials.messageThreadId
      );
    } catch (error) {
      await log(`Failed to send file change notification: ${error}`, 'warn');
    }
  }

  private async sendAutoHealNotification(success: boolean): Promise<void> {
    try {
      const credentials = await getTelegramCredentials(this.config);
      if (!credentials) return;

      const message = success
        ? `✅ **Auto-Heal Successful**\n\nThe workflow crashed but was automatically repaired by Claude Code. The process has been restarted with the patched workflow.`
        : `❌ **Auto-Heal Failed**\n\nThe workflow crashed and auto-heal was unable to fix it. Falling back to normal restart logic.`;

      await sendTelegramMessage(
        credentials.botToken,
        credentials.chatId,
        message,
        this.dryRun,
        credentials.messageThreadId
      );
    } catch (error) {
      await log(`Failed to send auto-heal notification: ${error}`, 'warn');
    }
  }

  private async sendHangNotification(state: WorkflowState): Promise<void> {
    try {
      const credentials = await getTelegramCredentials(this.config);
      if (!credentials) return;

      const lastHeartbeat = state.heartbeat || 'never';
      const message = `⚠️ **Workflow Hang Detected**\n\nThe workflow heartbeat is stale.\n\nLast heartbeat: \`${lastHeartbeat}\`\nThreshold: ${this.config.health.hang_threshold_seconds}s\n\nKilling hung process and restarting...`;

      await sendTelegramMessage(
        credentials.botToken,
        credentials.chatId,
        message,
        this.dryRun,
        credentials.messageThreadId
      );
    } catch (error) {
      await log(`Failed to send hang notification: ${error}`, 'warn');
    }
  }

  private async startUpdateCron(): Promise<void> {
    const intervalMs = this.config.updates.interval_seconds * 1000;
    await log(`Starting update cron (every ${this.config.updates.interval_seconds}s)`);

    this.updateInterval = setInterval(async () => {
      await this.sendStatusUpdate();
    }, intervalMs);
  }

  private async startHealthCheck(): Promise<void> {
    const checkIntervalMs = 10000; // Check every 10 seconds
    await log("Starting health check loop");

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, checkIntervalMs);
  }

  private async performHealthCheck(): Promise<void> {
    // Check if Smithers process is running
    if (this.smithersProc?.exitCode !== null) {
      await log("Health check: Smithers process is not running", "warn");
      return;
    }

    // Check heartbeat staleness
    try {
      const state = queryWorkflowState(this.config.workflow.db);
      const stale = isHeartbeatStale(
        state.heartbeat,
        this.config.health.hang_threshold_seconds
      );

      if (stale && !this.isHandlingHang) {
        await log(
          `Health check: Heartbeat is stale (threshold: ${this.config.health.hang_threshold_seconds}s). Killing hung process...`,
          "error"
        );

        // Set flag to prevent duplicate hang handling
        this.isHandlingHang = true;

        // Send notification about hang detection
        await this.sendHangNotification(state);

        // Kill the hung process (handleSmithersExit will be called automatically via onExit)
        if (this.smithersProc && this.smithersProc.exitCode === null) {
          this.smithersProc.kill();
          await log('Hung Smithers process killed');
        }
      }
    } catch (error) {
      await log(`Health check failed: ${error}`, "error");
    }
  }

  private async sendStatusUpdate(): Promise<void> {
    await log("Sending status update...");

    try {
      const state = queryWorkflowState(this.config.workflow.db);
      const credentials = await getTelegramCredentials(this.config);

      if (!credentials) {
        await log(
          "No Telegram credentials configured. Skipping update.",
          "warn"
        );
        return;
      }

      // Get repo name and branch
      const repoName = process.cwd().split("/").pop() || "unknown";
      const branchProc = Bun.spawnSync(["git", "branch", "--show-current"]);
      const branch = branchProc.stdout?.toString().trim() || "unknown";

      const message = formatStatusMessage(
        repoName,
        branch,
        state.status,
        state.summary,
        state.heartbeat
      );

      await sendTelegramMessage(
        credentials.botToken,
        credentials.chatId,
        message,
        this.dryRun,
        credentials.messageThreadId
      );
    } catch (error) {
      await log(`Failed to send status update: ${error}`, "error");
    }
  }

  async restart(): Promise<void> {
    await log("Restarting Smithers workflow...");

    if (this.smithersProc && this.smithersProc.exitCode === null) {
      this.smithersProc.kill();
      await this.smithersProc.exited;
    }

    this.restartAttempts = 0; // Reset counter on manual restart
    this.autoHealAttempts = 0;
    await this.startSmithers();
    await log("Smithers restarted successfully");
  }

  async stop(keepTakopi: boolean = false): Promise<void> {
    await log("Stopping supervisor...");

    // Clear intervals
    if (this.updateInterval) clearInterval(this.updateInterval);
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    if (this.workflowRestartDebounceTimer) clearTimeout(this.workflowRestartDebounceTimer);

    // Close file watcher
    if (this.workflowWatcher) {
      this.workflowWatcher.close();
      await log('File watcher stopped');
    }

    // Kill Smithers subprocess
    if (this.smithersProc && this.smithersProc.exitCode === null) {
      await log("Stopping Smithers...");
      this.smithersProc.kill();
      await this.smithersProc.exited;
    }

    // Conditionally kill Takopi subprocess
    if (!keepTakopi) {
      if (this.takopiProc && this.takopiProc.exitCode === null) {
        await log("Stopping Takopi...");
        this.takopiProc.kill();
        await this.takopiProc.exited;
      }
    } else {
      await log("Keeping Takopi running (--keep-takopi flag set)");
    }

    await log("Supervisor stopped");
  }
}
