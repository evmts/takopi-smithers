import * as path from "node:path";
import * as fs from "node:fs";
import type { Config } from "./config";
import type { Worktree } from "./worktree";

export function getPidFilePath(config: Config): string {
  // If this is a worktree config, use worktree-specific PID file
  if (config.worktree) {
    const safeBranchName = config.worktree.branch.replace(/[^a-zA-Z0-9-_]/g, "_");
    return path.join(
      path.dirname(config.workflow.script),
      "..",
      ".takopi-smithers",
      "worktrees",
      safeBranchName,
      "supervisor.pid"
    );
  }

  // Main worktree PID file
  return path.join(
    path.dirname(config.workflow.script),
    "..",
    ".takopi-smithers",
    "supervisor.pid"
  );
}

export function getWorktreePidFilePath(worktree: Worktree): string {
  const safeBranchName = worktree.branch.replace(/[^a-zA-Z0-9-_]/g, "_");
  return `.takopi-smithers/worktrees/${safeBranchName}/supervisor.pid`;
}

export async function getAllWorktreePidFiles(): Promise<Array<{ worktree: Worktree; pidPath: string; pid: number | null }>> {
  const { listWorktrees } = await import("./worktree");
  const worktrees = await listWorktrees();
  const pidFiles: Array<{ worktree: Worktree; pidPath: string; pid: number | null }> = [];

  for (const worktree of worktrees) {
    const pidPath = getWorktreePidFilePath(worktree);
    const pid = readPidFile(pidPath);
    pidFiles.push({ worktree, pidPath, pid });
  }

  return pidFiles;
}

export function writePidFile(pidPath: string, pid: number): void {
  fs.mkdirSync(path.dirname(pidPath), { recursive: true });
  fs.writeFileSync(pidPath, pid.toString(), "utf-8");
}

export function readPidFile(pidPath: string): number | null {
  if (!fs.existsSync(pidPath)) {
    return null;
  }

  try {
    const pidStr = fs.readFileSync(pidPath, "utf-8").trim();
    const pid = parseInt(pidStr, 10);

    // Check if process is actually running
    try {
      process.kill(pid, 0); // Signal 0 checks existence without killing
      return pid;
    } catch {
      // Process not running, clean up stale PID file
      fs.unlinkSync(pidPath);
      return null;
    }
  } catch {
    return null;
  }
}

export function deletePidFile(pidPath: string): void {
  if (fs.existsSync(pidPath)) {
    fs.unlinkSync(pidPath);
  }
}
