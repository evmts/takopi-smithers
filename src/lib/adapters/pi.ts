import type { AutoHealAdapter } from './base';
import type { AutoHealContext, AutoHealResult } from '../autoheal';
import { log } from '../logger';

/**
 * Pi adapter
 *
 * Uses Pi's non-interactive mode: `pi -p "prompt"`
 */
export class PiAdapter implements AutoHealAdapter {
  name = 'pi';

  async invoke(
    prompt: string,
    workflowScript: string,
    _context: AutoHealContext
  ): Promise<AutoHealResult> {
    await log('Invoking Pi for auto-heal...');

    try {
      // Write prompt to temp file for debugging
      const promptFile = '.takopi-smithers/autoheal-prompt-pi.txt';
      await Bun.write(promptFile, prompt);

      // Invoke Pi in non-interactive print mode
      // Pi's -p flag enables print mode for scripting
      const proc = Bun.spawn(
        ['pi', '-p', prompt],
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

      await log(`Pi exited with code ${exitCode}`);
      await log(`Pi stdout: ${stdout.slice(0, 500)}`);
      if (stderr) await log(`Pi stderr: ${stderr.slice(0, 500)}`, 'warn');

      if (exitCode !== 0) {
        return {
          success: false,
          error: `Pi failed with exit code ${exitCode}`,
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
        error: `Pi invocation failed: ${err}`,
      };
    }
  }
}
