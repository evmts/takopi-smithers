#!/usr/bin/env bun

import { parseArgs } from './lib/args';
import { showHelp } from './commands/help';
import { showVersion } from './commands/version';
import { init } from './commands/init';
import { start } from './commands/start';
import { stop } from './commands/stop';
import { status } from './commands/status';
import { restart } from './commands/restart';
import { doctor } from './commands/doctor';
import { logs } from './commands/logs';

async function main() {
  const args = Bun.argv.slice(2); // Remove 'bun' and script path
  const parsed = parseArgs(args);

  // Handle global flags
  if (parsed.flags.version || parsed.flags.v) {
    showVersion();
    process.exit(0);
  }

  if (parsed.flags.help || parsed.flags.h || args.length === 0) {
    showHelp();
    process.exit(0);
  }

  // Handle commands (will be implemented in future milestones)
  const command = parsed.command;

  switch (command) {
    case 'init':
      await init({
        force: parsed.flags.force as boolean,
        worktree: parsed.flags.worktree as string | undefined,
      });
      break;
    case 'start':
      await start({
        dryRun: parsed.flags['dry-run'] as boolean,
        worktree: parsed.flags.worktree as string | undefined,
        allWorktrees: parsed.flags['all-worktrees'] as boolean,
      });
      break;
    case 'status':
      await status({
        json: parsed.flags.json as boolean,
        worktree: parsed.flags.worktree as string | undefined,
        allWorktrees: parsed.flags['all-worktrees'] as boolean,
      });
      break;
    case 'restart':
      await restart({
        worktree: parsed.flags.worktree as string | undefined,
        allWorktrees: parsed.flags['all-worktrees'] as boolean,
      });
      break;
    case 'stop':
      await stop({
        keepTakopi: parsed.flags['keep-takopi'] as boolean,
        worktree: parsed.flags.worktree as string | undefined,
        allWorktrees: parsed.flags['all-worktrees'] as boolean,
      });
      break;
    case 'doctor':
      await doctor();
      break;
    case 'logs':
      await logs({
        follow: parsed.flags.follow as boolean || parsed.flags.f as boolean,
        lines: (parsed.flags.lines ? parseInt(parsed.flags.lines as string, 10) : undefined) ||
               (parsed.flags.n ? parseInt(parsed.flags.n as string, 10) : undefined),
        level: parsed.flags.level as 'info' | 'warn' | 'error' | undefined,
        worktree: parsed.flags.worktree as string | undefined,
      });
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "takopi-smithers --help" for usage.');
      process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
