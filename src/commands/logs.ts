import { existsSync } from 'node:fs';

interface LogsOptions {
  follow?: boolean;
  lines?: number;
  level?: 'info' | 'warn' | 'error';
  worktree?: string;
  since?: string;
}

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
};

function parseSince(since: string): number {
  const match = since.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error('Invalid --since format. Use format like: 5s, 10m, 2h, 1d');
  }

  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;

  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };

  return value * multipliers[unit]! * 1000; // Return milliseconds
}

function colorizeLogLine(line: string): string {
  // Colorize based on log level
  if (line.includes('[error]')) {
    return `${colors.red}${line}${colors.reset}`;
  } else if (line.includes('[warn]')) {
    return `${colors.yellow}${line}${colors.reset}`;
  }
  return line;
}

function filterByTime(lines: string[], sinceMs: number): string[] {
  const cutoffTime = Date.now() - sinceMs;

  return lines.filter(line => {
    // Extract timestamp from log line (format: [2026-02-12T00:00:00Z])
    const timestampMatch = line.match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)\]/);
    if (!timestampMatch) return true; // Include lines without timestamps

    try {
      const lineTime = new Date(timestampMatch[1]!).getTime();
      return lineTime >= cutoffTime;
    } catch {
      return true; // Include lines with invalid timestamps
    }
  });
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
  const sinceMs = options.since ? parseSince(options.since) : null;

  // Helper to filter and print log lines
  function printFilteredLines(content: string, fromEnd: boolean = true): void {
    const allLines = content.split('\n').filter(l => l.trim());

    // Filter by time if --since is specified
    let filtered = sinceMs ? filterByTime(allLines, sinceMs) : allLines;

    // Filter by level if specified
    if (levelFilter) {
      const pattern = new RegExp(`\\[${levelFilter}\\]`, 'i');
      filtered = filtered.filter(line => pattern.test(line));
    }

    // Get last N lines or all
    const lines = fromEnd ? filtered.slice(-numLines) : filtered;

    // Colorize and print
    lines.forEach(line => console.log(colorizeLogLine(line)));
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
