import { createSmithers } from "smthrs";
import { z } from "zod";

const testSchema = z.object({
  message: z.string(),
});

const { Workflow, Task, smithers, outputs, db } = createSmithers(
  { test: testSchema },
  { dbPath: ".smithers/workflow.db" }
);

const sqlite = (db as any).$client as {
  exec: (sql: string) => unknown;
  run: (sql: string, params?: unknown[]) => unknown;
};

sqlite.exec([
  "CREATE TABLE IF NOT EXISTS state (",
  "  key TEXT PRIMARY KEY,",
  "  value TEXT NOT NULL,",
  "  updated_at TEXT DEFAULT (datetime('now'))",
  ")",
].join("\n"));

function updateState(key: string, value: string) {
  sqlite.run(
    "INSERT OR REPLACE INTO state (key, value, updated_at) VALUES (?, ?, datetime('now'))",
    [key, value]
  );
}

updateState("supervisor.status", "running");
updateState("supervisor.summary", "Workflow is about to hang");
updateState("supervisor.heartbeat", new Date().toISOString());

export default smithers(() => (
  <Workflow name="hanging-test-workflow">
    <Task id="hang-forever" output={outputs.test}>
      {async () => {
        while (true) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }}
    </Task>
  </Workflow>
));
