import type { Config } from './config';
import { log } from './logger';
import { queryWorkflowState } from './db';
import { getAdapter } from './adapters';

export interface AutoHealContext {
  exitCode: number | null;
  signalCode: number | null;
  workflowScript: string;
  workflowContent: string;
  dbPath: string;
  dbState: {
    status: string | null;
    summary: string | null;
    last_error: string | null;
    heartbeat: string | null;
  };
  recentLogs: string;
  restartAttempts: number;
}

export interface AutoHealResult {
  success: boolean;
  patchedWorkflow?: string;
  error?: string;
  agentOutput?: string;
}

/**
 * Captures context for auto-heal: logs, workflow file, DB state, crash info
 */
export async function captureAutoHealContext(
  config: Config,
  exitCode: number | null,
  signalCode: number | null,
  restartAttempts: number
): Promise<AutoHealContext> {
  await log('Capturing auto-heal context...');

  // Read last 100 lines of supervisor log
  const logPath = '.takopi-smithers/logs/supervisor.log';
  let recentLogs = '';
  try {
    const logContent = await Bun.file(logPath).text();
    const lines = logContent.split('\n');
    recentLogs = lines.slice(-100).join('\n');
  } catch (err) {
    recentLogs = `Failed to read logs: ${err}`;
  }

  // Read current workflow file
  const workflowScript = config.workflow.script;
  let workflowContent = '';
  try {
    workflowContent = await Bun.file(workflowScript).text();
  } catch (err) {
    workflowContent = `Failed to read workflow: ${err}`;
  }

  // Query DB state
  const dbPath = config.workflow.db;
  const dbState = queryWorkflowState(dbPath);

  return {
    exitCode,
    signalCode,
    workflowScript,
    workflowContent,
    dbPath,
    dbState,
    recentLogs,
    restartAttempts,
  };
}

/**
 * Builds the repair prompt for Claude Code
 */
export function buildRepairPrompt(context: AutoHealContext): string {
  return `# Auto-heal: Smithers Workflow Crash Recovery

The Smithers workflow process crashed. Your job is to diagnose and fix the issue.

## Crash Information
- Exit code: ${context.exitCode ?? 'null'}
- Signal: ${context.signalCode ?? 'null'}
- Restart attempts: ${context.restartAttempts}

## Database State (from SQLite)
- Status: ${context.dbState.status ?? 'unknown'}
- Summary: ${context.dbState.summary ?? 'N/A'}
- Last error: ${context.dbState.last_error ?? 'N/A'}
- Heartbeat: ${context.dbState.heartbeat ?? 'N/A'}

## Recent Logs (last 100 lines)
\`\`\`
${context.recentLogs}
\`\`\`

## Current Workflow File (${context.workflowScript})
\`\`\`tsx
${context.workflowContent}
\`\`\`

## Your Task
1. Analyze the crash: look at logs, exit code, DB state, and workflow code
2. Identify the root cause (syntax error, runtime error, missing import, infinite loop, etc.)
3. Patch the workflow file to fix the issue
   - Add error handling, timeouts, retries as needed
   - Fix syntax/type errors
   - Add graceful fallbacks
4. Ensure the workflow remains **resumable** (use Smithers SQLite persistence patterns)
5. Keep the plan simple and observable

## Constraints
- Only edit ${context.workflowScript}
- Do NOT change the supervisor state key contract (supervisor.heartbeat, supervisor.status, supervisor.summary, supervisor.last_error)
- Do NOT break resumability
- Prefer robust, restart-friendly designs

## Output
Edit the workflow file to fix the crash. The supervisor will automatically restart after you're done.
`;
}


/**
 * Main auto-heal orchestrator (refactored to use adapters)
 */
export async function attemptAutoHeal(
  config: Config,
  exitCode: number | null,
  signalCode: number | null,
  restartAttempts: number
): Promise<boolean> {
  await log('=== Starting Auto-Heal Attempt ===');

  // 1. Get the configured adapter
  const adapter = getAdapter(config.autoheal.engine);
  if (!adapter) {
    await log(
      `Unknown auto-heal engine: ${config.autoheal.engine}. Skipping auto-heal.`,
      'error'
    );
    return false;
  }

  await log(`Using auto-heal adapter: ${adapter.name}`);

  // 2. Capture context
  const context = await captureAutoHealContext(
    config,
    exitCode,
    signalCode,
    restartAttempts
  );

  // 3. Build repair prompt
  const prompt = buildRepairPrompt(context);
  await log(`Repair prompt length: ${prompt.length} chars`);

  // 4. Invoke adapter
  const result = await adapter.invoke(prompt, context.workflowScript, context);

  // 5. Handle result
  if (result.success) {
    await log('✅ Auto-heal succeeded! Workflow file patched.');
    await log(`Patched workflow length: ${result.patchedWorkflow?.length ?? 0} chars`);
    return true;
  } else {
    await log(`❌ Auto-heal failed: ${result.error}`, 'error');
    if (result.agentOutput) {
      await log(`Agent output: ${result.agentOutput.slice(0, 1000)}`, 'error');
    }
    return false;
  }
}
