import { existsSync } from 'node:fs';

interface LogsOptions {
  follow?: boolean;
  lines?: number;
  level?: 'info' | 'warn' | 'error';
  worktree?: string;
}

export async function logs(options: LogsOptions = {}): Promise<void> {
  // Determine log path based on worktree
  let logPath = '.takopi-smithers/logs/supervisor.log';

  if (options.worktree) {
    const { findWorktreeByName, getWorktreeLogsPath } = await import('../lib/worktree');
    const worktree = await findWorktreeByName(options.worktree);
    if (!worktree) {
      console.error(`Error: Worktree '${options.worktree}' not found`);
      process.exit(1);
    }
    logPath = `${getWorktreeLogsPath(worktree)}/supervisor.log`;
  }

  if (!existsSync(logPath)) {
    console.error(`Error: Log file not found at ${logPath}`);
    console.error('\nHint: Have you run "takopi-smithers start" yet?');
    process.exit(1);
  }

  const numLines = options.lines || 50;
  const levelFilter = options.level;

  // Helper to filter and print log lines
  function printFilteredLines(content: string, fromEnd: boolean = true): void {
    const allLines = content.split('\n').filter(l => l.trim());

    // Filter by level if specified
    let filtered = allLines;
    if (levelFilter) {
      const pattern = new RegExp(`\\[${levelFilter}\\]`, 'i');
      filtered = allLines.filter(line => pattern.test(line));
    }

    // Get last N lines or all
    const lines = fromEnd ? filtered.slice(-numLines) : filtered;

    lines.forEach(line => console.log(line));
  }

  if (options.follow) {
    // Follow mode: print initial lines, then poll for new content
    let lastSize = 0;

    const pollInterval = setInterval(async () => {
      try {
        const file = Bun.file(logPath);
        const size = file.size;

        if (size > lastSize) {
          const content = await file.text();
          const newContent = content.slice(lastSize);
          printFilteredLines(newContent, false);
          lastSize = size;
        }
      } catch (error) {
        console.error(`Error reading log file: ${error}`);
        clearInterval(pollInterval);
        process.exit(1);
      }
    }, 1000); // Poll every 1 second

    // Print initial content
    const initialContent = await Bun.file(logPath).text();
    printFilteredLines(initialContent);
    lastSize = (await Bun.file(logPath)).size;

    console.log('\n--- Following logs (Ctrl+C to stop) ---\n');

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      clearInterval(pollInterval);
      console.log('\n');
      process.exit(0);
    });
  } else {
    // Normal mode: just print last N lines
    const content = await Bun.file(logPath).text();
    printFilteredLines(content);
  }
}
