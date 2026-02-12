import { test, expect, describe } from 'bun:test';
import { PiAdapter } from './pi';
import type { AutoHealContext } from '../autoheal';

describe('PiAdapter', () => {
  test('should have correct name', () => {
    const adapter = new PiAdapter();
    expect(adapter.name).toBe('pi');
  });

  test('should save prompt to file for debugging', async () => {
    const adapter = new PiAdapter();
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

    // This will fail because pi isn't installed, but should save the prompt
    const result = await adapter.invoke(testPrompt, '.smithers/workflow.tsx', context);

    // Verify prompt was saved
    const savedPrompt = await Bun.file('.takopi-smithers/autoheal-prompt-pi.txt').text();
    expect(savedPrompt).toBe(testPrompt);

    // Should fail (pi command not found in test env)
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('should handle missing pi command gracefully', async () => {
    const adapter = new PiAdapter();
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
