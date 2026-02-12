export type Command =
  | 'init'
  | 'start'
  | 'status'
  | 'restart'
  | 'stop'
  | 'doctor'
  | 'logs';

export interface ParsedArgs {
  command: string | null;
  flags: Record<string, boolean | string>;
  positionals: string[];
}

const _flagMap: Record<string, string> = {
  '-h': 'help',
  '-v': 'version',
  '-f': 'follow',
  '-n': 'lines',
  '--help': 'help',
  '--version': 'version',
  '--force': 'force',
  '--dry-run': 'dry-run',
  '--keep-takopi': 'keep-takopi',
  '--follow': 'follow',
  '--lines': 'lines',
  '--level': 'level',
  '--json': 'json',
  '--worktree': 'worktree',
  '--all-worktrees': 'all-worktrees',
};

/**
 * Validate that mutually exclusive flags are not used together
 */
function validateFlags(flags: Record<string, boolean | string>): void {
  // Check for --worktree and --all-worktrees being used together
  if (flags['worktree'] && flags['all-worktrees']) {
    throw new Error("Cannot use both --worktree and --all-worktrees flags together");
  }
}

export function parseArgs(args: string[]): ParsedArgs {
  const flags: Record<string, boolean | string> = {};
  const positionals: string[] = [];
  let command: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Guard against undefined (satisfies noUncheckedIndexedAccess)
    if (!arg) continue;

    if (arg.startsWith('--')) {
      // Long flag
      const flagName = arg.slice(2);
      const nextArg = args[i + 1];

      // Check if next arg is a value (doesn't start with -)
      if (nextArg && !nextArg.startsWith('-')) {
        flags[flagName] = nextArg;
        i++; // Skip next arg since we consumed it
      } else {
        flags[flagName] = true;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      // Short flag
      const flagName = arg.slice(1);
      const nextArg = args[i + 1];

      // Check if next arg is a value (doesn't start with -)
      if (nextArg && !nextArg.startsWith('-')) {
        flags[flagName] = nextArg;
        i++; // Skip next arg since we consumed it
      } else {
        flags[flagName] = true;
      }
    } else {
      // Positional argument
      if (!command) {
        command = arg;
      } else {
        positionals.push(arg);
      }
    }
  }

  // Validate mutually exclusive flags
  validateFlags(flags);

  return { command, flags, positionals };
}
