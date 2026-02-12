import { test, expect, describe } from 'bun:test';
import {
  buildRepairPrompt,
  type AutoHealContext,
} from './autoheal';
import { getAdapter } from './adapters';

describe('autoheal', () => {
  test('buildRepairPrompt includes all context', () => {
    const context: AutoHealContext = {
      exitCode: 1,
      signalCode: null,
      workflowScript: '.smithers/workflow.tsx',
      workflowContent: 'export default <Workflow>...</Workflow>',
      dbPath: '.smithers/workflow.db',
      dbState: {
        status: 'error',
        summary: 'Task failed',
        last_error: 'ReferenceError: foo is not defined',
        heartbeat: '2026-01-01T00:00:00Z',
      },
      recentLogs: '[2026-01-01T00:00:00Z] [error] Process crashed',
      restartAttempts: 2,
    };

    const prompt = buildRepairPrompt(context);

    // Check that prompt includes key context
    expect(prompt).toContain('Exit code: 1');
    expect(prompt).toContain('Restart attempts: 2');
    expect(prompt).toContain('Status: error');
    expect(prompt).toContain('Last error: ReferenceError: foo is not defined');
    expect(prompt).toContain('Process crashed');
    expect(prompt).toContain('export default <Workflow>');
    expect(prompt).toContain('.smithers/workflow.tsx');
  });

  test('buildRepairPrompt handles missing context gracefully', () => {
    const context: AutoHealContext = {
      exitCode: null,
      signalCode: 9,
      workflowScript: '.smithers/workflow.tsx',
      workflowContent: '',
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

    const prompt = buildRepairPrompt(context);

    expect(prompt).toContain('Exit code: null');
    expect(prompt).toContain('Signal: 9');
    expect(prompt).toContain('Status: unknown');
    expect(prompt).toContain('N/A');
  });
});

describe('adapter selection', () => {
  test('getAdapter returns ClaudeCodeAdapter for "claude"', () => {
    const adapter = getAdapter('claude');
    expect(adapter).not.toBeNull();
    expect(adapter?.name).toBe('claude');
  });

  test('getAdapter returns CodexAdapter for "codex"', () => {
    const adapter = getAdapter('codex');
    expect(adapter).not.toBeNull();
    expect(adapter?.name).toBe('codex');
  });

  test('getAdapter returns null for unknown engine', () => {
    const adapter = getAdapter('unknown');
    expect(adapter).toBeNull();
  });
});
