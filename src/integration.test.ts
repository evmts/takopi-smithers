import { test, expect } from "bun:test";
import { existsSync } from 'node:fs';
import { loadConfig } from './lib/config';
import { isHeartbeatStale } from './lib/db';
import { buildRepairPrompt } from './lib/autoheal';

// Only run integration tests if explicitly requested
const RUN_INTEGRATION = process.env.RUN_INTEGRATION === '1';

if (RUN_INTEGRATION) {
  test('integration: devcontainer files exist', () => {
    expect(existsSync('.devcontainer/devcontainer.json')).toBe(true);
    expect(existsSync('.devcontainer/postCreate.sh')).toBe(true);
  });

  test('integration: documentation exists', () => {
    expect(existsSync('docs/codespaces.md')).toBe(true);
    expect(existsSync('docs/architecture.md')).toBe(true);
    expect(existsSync('docs/troubleshooting.md')).toBe(true);
  });

  test('integration: README is comprehensive', async () => {
    const readme = await Bun.file('README.md').text();
    expect(readme).toContain('takopi-smithers');
    expect(readme).toContain('Who this is for');
    expect(readme).toContain('Requirements');
    expect(readme).toContain('Commands');
    expect(readme).toContain('How it works');
    expect(readme).toContain('Codespaces');
  });

  test('Config loading integration', async () => {
    // Test that default config can be parsed
    const configContent = `
version = 1

[workflow]
script = ".smithers/workflow.tsx"
db = ".smithers/workflow.db"

[updates]
enabled = true
interval_seconds = 600

[health]
heartbeat_key = "supervisor.heartbeat"
heartbeat_write_interval_seconds = 30
hang_threshold_seconds = 300
restart_backoff_seconds = [5, 30, 120, 600]
max_restart_attempts = 20

[telegram]
bot_token = ""
chat_id = 0

[autoheal]
enabled = true
engine = "claude"
max_attempts = 3
`;

    const tempConfigPath = '/tmp/test-config.toml';
    await Bun.write(tempConfigPath, configContent);

    const config = await loadConfig(tempConfigPath);

    expect(config.version).toBe(1);
    expect(config.workflow.script).toBe('.smithers/workflow.tsx');
    expect(config.autoheal.engine).toBe('claude');
    expect(config.health.hang_threshold_seconds).toBe(300);
  });

  test('Auto-heal prompt generation integration', () => {
    const context = {
      exitCode: 1,
      signalCode: null,
      workflowScript: '.smithers/workflow.tsx',
      workflowContent: 'import { smithers } from "smithers";\n\nexport default smithers(<Workflow>...</Workflow>);',
      dbPath: '.smithers/workflow.db',
      dbState: {
        status: 'error',
        summary: 'Workflow crashed due to syntax error',
        last_error: 'SyntaxError: Unexpected token',
        heartbeat: '2024-02-12T10:00:00Z',
      },
      recentLogs: 'Error: workflow failed\n[stack trace]',
      restartAttempts: 2,
    };

    const prompt = buildRepairPrompt(context);

    expect(prompt).toContain('Exit code: 1');
    expect(prompt).toContain('Restart attempts: 2');
    expect(prompt).toContain('SyntaxError: Unexpected token');
    expect(prompt).toContain('.smithers/workflow.tsx');
    expect(prompt).toContain('Your Task');
  });

  test('Heartbeat staleness detection integration', () => {
    // Fresh heartbeat (5 seconds ago)
    const fresh = new Date(Date.now() - 5000).toISOString();
    expect(isHeartbeatStale(fresh, 300)).toBe(false);

    // Stale heartbeat (10 minutes ago)
    const stale = new Date(Date.now() - 600000).toISOString();
    expect(isHeartbeatStale(stale, 300)).toBe(true);

    // Null/undefined heartbeat is stale
    expect(isHeartbeatStale(null, 300)).toBe(true);
  });
} else {
  test.skip('integration tests (set RUN_INTEGRATION=1 to run)', () => {
    // Placeholder test
  });
}
