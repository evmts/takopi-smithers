import { test, expect, describe } from 'bun:test';
import { PiAdapter } from './pi';
import type { AutoHealContext } from '../autoheal';

describe('PiAdapter', () => {
  test('should have correct name', () => {
    const adapter = new PiAdapter();
    expect(adapter.name).toBe('pi');
  });

  test('should save prompt to file for debugging', async () => {
    const adapter = new PiAdapter('__takopi_missing_pi__', 1_000);
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

    const testPrompt = 'Test auto-heal prompt for Pi';

    // This uses a missing command on purpose, but should still save the prompt.
    const result = await adapter.invoke(testPrompt, '.smithers/workflow.tsx', context);

    // Verify prompt was saved
    const savedPrompt = await Bun.file('.takopi-smithers/autoheal-prompt-pi.txt').text();
    expect(savedPrompt).toBe(testPrompt);

    // Should fail because the configured command does not exist.
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('should handle missing pi command gracefully', async () => {
    const adapter = new PiAdapter('__takopi_missing_pi__', 1_000);
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
