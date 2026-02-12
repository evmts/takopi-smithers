export function showHelp(): void {
  const helpText = `
takopi-smithers - Run long-lived Smithers workflows controlled by Takopi via Telegram

USAGE:
  takopi-smithers [command] [options]

COMMANDS:
  init [--worktree <name>]          Scaffold files for this repo (or specific worktree)
  start [--worktree <name>]         Start supervisor, Takopi, and Smithers
  status [--worktree <name>]        Show workflow status
  restart [--worktree <name>]       Restart workflow
  stop [--worktree <name>]          Stop supervisor and subprocesses
  logs [--worktree <name>]          View supervisor logs
  doctor                            Run diagnostics

OPTIONS:
  --help, -h                        Show this help
  --version, -v                     Show version
  --worktree <name>                 Target specific git worktree/branch
  --force                           Overwrite existing files (init only)
  --dry-run                         Don't send Telegram messages (start only)
  --keep-takopi                     Don't stop Takopi (stop only)
  --follow, -f                      Follow logs in real-time (logs only)
  --lines, -n <num>                 Number of log lines to show (logs only)
  --level <level>                   Filter logs by level: info|warn|error (logs only)
  --json                            Output status as JSON (status only)

EXAMPLES:
  # Initialize main workflow
  takopi-smithers init

  # Initialize workflow for feature branch
  git worktree add ../myrepo-feature feature-branch
  cd ../myrepo-feature
  takopi-smithers init  # Auto-detects worktree
  # OR from main repo:
  takopi-smithers init --worktree feature-branch

  # Start supervisor (auto-detects current worktree)
  takopi-smithers start

  # Start supervisor for specific worktree from main repo
  takopi-smithers start --worktree feature-branch

  # View logs for specific worktree
  takopi-smithers logs --worktree feature-branch --follow

  # Other commands
  takopi-smithers status --worktree feature-branch
  takopi-smithers restart --worktree feature-branch
  takopi-smithers stop --worktree feature-branch

WORKTREE SUPPORT:
  Each git worktree can run an independent workflow with isolated config, DB, and logs.
  Auto-detects worktree when you cd to the directory, or use --worktree flag.
  See docs/worktrees.md for detailed setup.

DOCUMENTATION:
  https://github.com/yourusername/takopi-smithers

REQUIREMENTS:
  - Bun runtime
  - Python 3.14+ with uv (for Takopi)
  - Git repository
  - Telegram bot token (optional, for status updates)
`;
  console.log(helpText);
}
