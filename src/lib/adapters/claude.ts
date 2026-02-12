import type { AutoHealAdapter } from './base';
import type { AutoHealContext, AutoHealResult } from '../autoheal';
import { log } from '../logger';

export class ClaudeCodeAdapter implements AutoHealAdapter {
  name = 'claude';

  async invoke(
    prompt: string,
    workflowScript: string,
    _context: AutoHealContext
  ): Promise<AutoHealResult> {
    await log('Invoking Claude Code for auto-heal...');

    try {
      // Write prompt to temp file (for debugging)
      const promptFile = '.takopi-smithers/autoheal-prompt.txt';
      await Bun.write(promptFile, prompt);

      // Invoke Claude Code in non-interactive mode
      // Use -p flag and force subscription auth via empty ANTHROPIC_API_KEY
      const proc = Bun.spawn(
        ['claude', '-p', prompt, workflowScript],
        {
          cwd: process.cwd(),
          stdout: 'pipe',
          stderr: 'pipe',
          env: {
            ...process.env,
            ANTHROPIC_API_KEY: '', // Force subscription auth, not interactive UI
          },
        }
      );

      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      await log(`Claude Code exited with code ${exitCode}`);
      await log(`Claude stdout: ${stdout.slice(0, 500)}`);
      if (stderr) await log(`Claude stderr: ${stderr.slice(0, 500)}`, 'warn');

      if (exitCode !== 0) {
        return {
          success: false,
          error: `Claude Code failed with exit code ${exitCode}`,
          agentOutput: stdout + '\n' + stderr,
        };
      }

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
        error: `Auto-heal invocation failed: ${err}`,
      };
    }
  }
}
