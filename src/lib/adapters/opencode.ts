import type { AutoHealAdapter } from './base';
import type { AutoHealContext, AutoHealResult } from '../autoheal';
import { log } from '../logger';

/**
 * OpenCode adapter
 *
 * Uses OpenCode's non-interactive mode: `opencode -p "prompt" -q`
 * The -q flag disables the spinner (important for scripts/automation)
 */
export class OpenCodeAdapter implements AutoHealAdapter {
  name = 'opencode';

  async invoke(
    prompt: string,
    workflowScript: string,
    _context: AutoHealContext
  ): Promise<AutoHealResult> {
    await log('Invoking OpenCode for auto-heal...');

    try {
      // Write prompt to temp file for debugging
      const promptFile = '.takopi-smithers/autoheal-prompt-opencode.txt';
      await Bun.write(promptFile, prompt);

      // Invoke OpenCode in non-interactive mode with quiet flag
      // OpenCode's -p flag accepts the prompt, -q disables spinner
      const proc = Bun.spawn(
        ['opencode', '-p', prompt, '-q'],
        {
          cwd: process.cwd(),
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env },
        }
      );

      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      await log(`OpenCode exited with code ${exitCode}`);
      await log(`OpenCode stdout: ${stdout.slice(0, 500)}`);
      if (stderr) await log(`OpenCode stderr: ${stderr.slice(0, 500)}`, 'warn');

      if (exitCode !== 0) {
        return {
          success: false,
          error: `OpenCode failed with exit code ${exitCode}`,
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
        error: `OpenCode invocation failed: ${err}`,
      };
    }
  }
}
