import { Database } from "bun:sqlite";
import * as fs from "node:fs";

export interface WorkflowState {
  status: string | null;
  summary: string | null;
  heartbeat: string | null;
  last_error: string | null;
}

export function queryWorkflowState(dbPath: string): WorkflowState {
  if (!fs.existsSync(dbPath)) {
    return {
      status: null,
      summary: null,
      heartbeat: null,
      last_error: null,
    };
  }

  const db = new Database(dbPath, { readonly: true });

  try {
    // Query all supervisor state keys
    const rows = db
      .query<{ key: string; value: string }, []>(
        `SELECT key, value FROM state
         WHERE key IN ('supervisor.status', 'supervisor.summary', 'supervisor.heartbeat', 'supervisor.last_error')`
      )
      .all();

    const state: WorkflowState = {
      status: null,
      summary: null,
      heartbeat: null,
      last_error: null,
    };

    for (const row of rows) {
      if (row.key === "supervisor.status") state.status = row.value;
      if (row.key === "supervisor.summary") state.summary = row.value;
      if (row.key === "supervisor.heartbeat") state.heartbeat = row.value;
      if (row.key === "supervisor.last_error") state.last_error = row.value;
    }

    return state;
  } finally {
    db.close();
  }
}

export function isHeartbeatStale(
  heartbeat: string | null,
  thresholdSeconds: number
): boolean {
  if (!heartbeat) return true;

  try {
    const heartbeatTime = new Date(heartbeat).getTime();

    // Check if the date is invalid (getTime() returns NaN for invalid dates)
    if (isNaN(heartbeatTime)) return true;

    const now = Date.now();
    const ageSeconds = (now - heartbeatTime) / 1000;

    return ageSeconds > thresholdSeconds;
  } catch {
    return true; // If heartbeat is malformed, treat as stale
  }
}

export function getHeartbeatAge(dbPath: string): number | null {
  const state = queryWorkflowState(dbPath);
  if (!state.heartbeat) return null;

  try {
    const heartbeatTime = new Date(state.heartbeat).getTime();
    if (isNaN(heartbeatTime)) return null;

    const now = Date.now();
    const ageSeconds = (now - heartbeatTime) / 1000;

    return ageSeconds;
  } catch {
    return null;
  }
}

export function formatHeartbeatAge(seconds: number): string {
  if (seconds < 60) {
    return `${Math.floor(seconds)} seconds ago`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(seconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
}

export interface WorkflowProgress {
  restarts: number;
  autoheals: number;
}

export function getWorkflowProgress(dbPath: string): WorkflowProgress {
  if (!fs.existsSync(dbPath)) {
    return { restarts: 0, autoheals: 0 };
  }

  const db = new Database(dbPath, { readonly: true });

  try {
    // Query for restart and autoheal counts from state table
    const restartRow = db
      .query<{ value: string }, []>(
        "SELECT value FROM state WHERE key = 'supervisor.restart_count'"
      )
      .get();

    const autohealRow = db
      .query<{ value: string }, []>(
        "SELECT value FROM state WHERE key = 'supervisor.autoheal_count'"
      )
      .get();

    return {
      restarts: restartRow ? parseInt(restartRow.value, 10) || 0 : 0,
      autoheals: autohealRow ? parseInt(autohealRow.value, 10) || 0 : 0,
    };
  } finally {
    db.close();
  }
}
