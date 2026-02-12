import * as path from "node:path";
import * as fs from "node:fs";
import type { Config } from "./config";

export function getPidFilePath(config: Config): string {
  return path.join(
    path.dirname(config.workflow.script),
    "..",
    ".takopi-smithers",
    "supervisor.pid"
  );
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
