import { smithers, Workflow, Task } from "smithers";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { Database } from "bun:sqlite";

// Define a simple schema
const testTable = sqliteTable("test", {
  id: integer("id").primaryKey(),
  message: text("message").notNull(),
});

// State table for supervisor integration
const stateTable = sqliteTable("state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const schema = {
  test: testTable,
  state: stateTable,
};

// Initialize Smithers with DB connection
const db = drizzle("file:.smithers/workflow.db", { schema });

// Define a workflow that hangs after writing heartbeat once
export default smithers(
  <Workflow
    name="Hanging Test Workflow"
    db={db}
    onStart={async (ctx) => {
      // Ensure state table exists (smithers may not create it automatically)
      const sqlite = new Database(".smithers/workflow.db");
      sqlite.run(`
        CREATE TABLE IF NOT EXISTS state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
      sqlite.close();

      // Write initial heartbeat and status using drizzle
      await ctx.db.execute(
        ctx.db.$sql`INSERT OR REPLACE INTO state (key, value)
         VALUES ('supervisor.heartbeat', datetime('now')),
                ('supervisor.status', 'running'),
                ('supervisor.summary', 'Workflow is about to hang')
        `
      );
    }}
  >
    <Task id="hang-forever" output={schema.test}>
      {async (ctx) => {
        console.log('Task started, entering infinite loop to simulate hang...');

        // Hang forever - no more heartbeat updates
        while (true) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // This line never executes
        return { id: 1, message: 'unreachable' };
      }}
    </Task>
  </Workflow>
);
