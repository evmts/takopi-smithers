import type { AutoHealAdapter } from './base';
import type { AutoHealContext, AutoHealResult } from '../autoheal';
import { log } from '../logger';

interface CodexEvent {
  type: string;
  turn?: {
    status?: string;
    error?: { message?: string };
  };
  item?: {
    id?: string;
    type?: string;
    status?: string;
    exit_code?: number;
  };
}

export class CodexAdapter implements AutoHealAdapter {
  name = 'codex';

  async invoke(
    prompt: string,
    workflowScript: string,
    _context: AutoHealContext
  ): Promise<AutoHealResult> {
    await log('Invoking Codex for auto-heal...');

    try {
      // Write prompt to temp file for debugging
      const promptFile = '.takopi-smithers/autoheal-prompt-codex.txt';
      await Bun.write(promptFile, prompt);

      // Invoke codex exec --json
      // Pass the prompt as a direct argument
      const proc = Bun.spawn(
        ['codex', 'exec', '--json', prompt],
        {
          cwd: process.cwd(),
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env },
        }
      );

      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();

      await log(`Codex exited with code ${exitCode}`);

      // Parse JSONL output (one JSON object per line)
      const events: CodexEvent[] = [];
      const lines = stdout.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const event = JSON.parse(line) as CodexEvent;
          events.push(event);
        } catch {
          await log(`Failed to parse JSONL line: ${line.slice(0, 100)}`, 'warn');
        }
      }

      await log(`Parsed ${events.length} Codex events`);

      // Determine success/failure from events
      const turnCompleted = events.find((e) => e.type === 'turn.completed');
      const turnFailed = events.find((e) => e.type === 'turn.failed');

      if (turnFailed) {
        const errorMsg = turnFailed.turn?.error?.message || 'Unknown error';
        return {
          success: false,
          error: `Codex turn failed: ${errorMsg}`,
          agentOutput: stdout,
        };
      }

      if (!turnCompleted) {
        return {
          success: false,
          error: 'Codex did not complete successfully (no turn.completed event)',
          agentOutput: stdout,
        };
      }

      // Check for file_change items to confirm edits were made
      const fileChanges = events.filter(
        (e) => e.item?.type === 'file_change' && e.item?.status === 'completed'
      );

      await log(`Codex made ${fileChanges.length} file changes`);

      // Read the patched workflow file
      const patchedWorkflow = await Bun.file(workflowScript).text();

      return {
        success: true,
        patchedWorkflow,
        agentOutput: stdout,
      };
    } catch (err) {
      return {
        success: false,
        error: `Codex invocation failed: ${err}`,
      };
    }
  }
}
