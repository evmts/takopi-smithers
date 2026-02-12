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
