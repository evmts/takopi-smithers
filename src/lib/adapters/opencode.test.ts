import { test, expect, describe } from 'bun:test';
import { OpenCodeAdapter } from './opencode';
import type { AutoHealContext } from '../autoheal';

describe('OpenCodeAdapter', () => {
  test('should have correct name', () => {
    const adapter = new OpenCodeAdapter();
    expect(adapter.name).toBe('opencode');
  });

  test('should save prompt to file for debugging', async () => {
    const adapter = new OpenCodeAdapter('__takopi_missing_opencode__', 1_000);
    const context: AutoHealContext = {
      exitCode: 1,
      signalCode: null,
      workflowScript: '.smithers/workflow.tsx',
      workflowContent: 'export default function() {}',
      dbPath: '.smithers/workflow.db',
      dbState: {
        status: null,
        summary: null,
        last_error: null,
        heartbeat: null,
      },
      recentLogs: '',
      restartAttempts: 0,
    };

    const testPrompt = 'Test auto-heal prompt for OpenCode';

    // This uses a missing command on purpose, but should still save the prompt.
    const result = await adapter.invoke(testPrompt, '.smithers/workflow.tsx', context);

    // Verify prompt was saved
    const savedPrompt = await Bun.file('.takopi-smithers/autoheal-prompt-opencode.txt').text();
    expect(savedPrompt).toBe(testPrompt);

    // Should fail because the configured command does not exist.
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('should handle missing opencode command gracefully', async () => {
    const adapter = new OpenCodeAdapter('__takopi_missing_opencode__', 1_000);
    const context: AutoHealContext = {
      exitCode: 1,
      signalCode: null,
      workflowScript: '.smithers/workflow.tsx',
      workflowContent: 'export default function() {}',
      dbPath: '.smithers/workflow.db',
      dbState: {
        status: 'error',
        summary: 'Test error',
        last_error: null,
        heartbeat: null,
      },
      recentLogs: 'Test logs',
      restartAttempts: 1,
    };

    const result = await adapter.invoke('test prompt', '.smithers/workflow.tsx', context);

    // Should handle command not found error gracefully
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
