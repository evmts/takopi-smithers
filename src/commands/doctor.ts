import { loadConfig, loadTakopiConfig } from '../lib/config';
import { sendTelegramMessage } from '../lib/telegram';

interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  guidance?: string;
}

export async function doctor(): Promise<void> {
  console.log('\n🩺 Running takopi-smithers diagnostics...\n');

  const results: CheckResult[] = [];

  // Run all checks
  results.push(await checkBun());
  results.push(await checkGitRepo());
  results.push(await checkWorktrees());
  results.push(await checkSmithersDependencies());
  results.push(await checkConfigFile());
  results.push(await checkSqlitePath());
  results.push(await checkTakopiConfig());
  results.push(await checkTelegramConnection());

  // Print results
  printResults(results);

  // Exit with appropriate code
  const hasFails = results.some((r) => r.status === 'fail');
  if (hasFails) {
    console.log('\n❌ Some checks failed. Please address the issues above.\n');
    process.exit(1);
  } else {
    console.log('\n✅ All checks passed!\n');
    process.exit(0);
  }
}

async function checkBun(): Promise<CheckResult> {
  try {
    const proc = Bun.spawnSync(['bun', '--version']);
    const version = proc.stdout?.toString().trim();

    if (proc.exitCode === 0 && version) {
      return {
        name: 'Bun Installation',
        status: 'pass',
        message: `Bun ${version} installed`,
      };
    }

    return {
      name: 'Bun Installation',
      status: 'fail',
      message: 'Bun not found or not working',
      guidance: 'Install Bun from https://bun.sh',
    };
  } catch (error) {
    return {
      name: 'Bun Installation',
      status: 'fail',
      message: `Failed to check Bun: ${error}`,
      guidance: 'Install Bun from https://bun.sh',
    };
  }
}

async function checkGitRepo(): Promise<CheckResult> {
  const gitConfigExists = await Bun.file('.git/config').exists();
  const gitFileExists = await Bun.file('.git').exists();

  if (gitConfigExists || gitFileExists) {
    return {
      name: 'Git Repository',
      status: 'pass',
      message: 'Running in a git repository',
    };
  }

  return {
    name: 'Git Repository',
    status: 'fail',
    message: 'Not in a git repository',
    guidance: 'Run takopi-smithers from a git repository root',
  };
}

async function checkWorktrees(): Promise<CheckResult> {
  try {
    const { listWorktrees, getCurrentWorktree } = await import('../lib/worktree');
    const worktrees = await listWorktrees();
    const current = await getCurrentWorktree();

    if (worktrees.length === 1) {
      return {
        name: 'Git Worktrees',
        status: 'pass',
        message: 'Single worktree (main)',
      };
    }

    const currentInfo = current ? ` (current: ${current.branch})` : '';
    return {
      name: 'Git Worktrees',
      status: 'pass',
      message: `${worktrees.length} worktrees detected${currentInfo}`,
      guidance: `Use --worktree flag or cd to a worktree directory`,
    };
  } catch (error) {
    return {
      name: 'Git Worktrees',
      status: 'warn',
      message: `Failed to check worktrees: ${error}`,
    };
  }
}

async function checkSmithersDependencies(): Promise<CheckResult> {
  const packageJsonExists = await Bun.file('package.json').exists();

  if (!packageJsonExists) {
    return {
      name: 'Smithers Dependencies',
      status: 'warn',
      message: 'package.json not found',
      guidance: 'Run "bun add smithers smithers-orchestrator" to install dependencies',
    };
  }

  try {
    const packageJson = await Bun.file('package.json').json();
    const hasSmithers =
      packageJson.dependencies?.['smithers'] ||
      packageJson.devDependencies?.['smithers'];
    const hasOrchestrator =
      packageJson.dependencies?.['smithers-orchestrator'] ||
      packageJson.devDependencies?.['smithers-orchestrator'];

    if (hasSmithers && hasOrchestrator) {
      return {
        name: 'Smithers Dependencies',
        status: 'pass',
        message: 'smithers and smithers-orchestrator found in package.json',
      };
    }

    const missing = [];
    if (!hasSmithers) missing.push('smithers');
    if (!hasOrchestrator) missing.push('smithers-orchestrator');

    return {
      name: 'Smithers Dependencies',
      status: 'warn',
      message: `Missing dependencies: ${missing.join(', ')}`,
      guidance: `Run "bun add ${missing.join(' ')}"`,
    };
  } catch (error) {
    return {
      name: 'Smithers Dependencies',
      status: 'fail',
      message: `Failed to parse package.json: ${error}`,
      guidance: 'Fix package.json syntax',
    };
  }
}

async function checkConfigFile(): Promise<CheckResult> {
  const configPath = '.takopi-smithers/config.toml';
  const exists = await Bun.file(configPath).exists();

  if (!exists) {
    return {
      name: 'Config File',
      status: 'warn',
      message: `${configPath} not found`,
      guidance: 'Run "takopi-smithers init" to create config',
    };
  }

  try {
    await loadConfig(configPath);
    return {
      name: 'Config File',
      status: 'pass',
      message: `${configPath} is valid`,
    };
  } catch (error) {
    return {
      name: 'Config File',
      status: 'fail',
      message: `Failed to parse config: ${error}`,
      guidance: 'Fix TOML syntax or re-run "takopi-smithers init --force"',
    };
  }
}

async function checkSqlitePath(): Promise<CheckResult> {
  const dbDir = '.smithers';

  // Check if directory exists by trying to list it
  try {
    const proc = Bun.spawnSync(['test', '-d', dbDir]);
    if (proc.exitCode !== 0) {
      return {
        name: 'SQLite Path',
        status: 'warn',
        message: `${dbDir} directory does not exist`,
        guidance: 'Run "takopi-smithers init" to create directory',
      };
    }
  } catch {
    return {
      name: 'SQLite Path',
      status: 'warn',
      message: `${dbDir} directory does not exist`,
      guidance: 'Run "takopi-smithers init" to create directory',
    };
  }

  // Try to write a test file
  try {
    const testFile = `${dbDir}/.write-test-${Date.now()}`;
    await Bun.write(testFile, 'test');
    await Bun.file(testFile).text(); // verify we can read

    // Clean up test file
    try {
      await Bun.spawn(['rm', testFile]).exited;
    } catch {
      // Ignore cleanup errors
    }

    return {
      name: 'SQLite Path',
      status: 'pass',
      message: `${dbDir} is writable`,
    };
  } catch (error) {
    return {
      name: 'SQLite Path',
      status: 'fail',
      message: `Cannot write to ${dbDir}: ${error}`,
      guidance: `Check permissions on ${dbDir}`,
    };
  }
}

async function checkTakopiConfig(): Promise<CheckResult> {
  const takopiConfigPath = `${process.env.HOME}/.takopi/takopi.toml`;

  try {
    const config = await loadTakopiConfig(takopiConfigPath);

    if (!config) {
      return {
        name: 'Takopi Config',
        status: 'warn',
        message: `Takopi config not found at ${takopiConfigPath}`,
        guidance: 'Run "takopi --onboard" to configure Takopi (requires TTY)',
      };
    }

    const hasTransport = config.transports?.telegram?.bot_token && config.transports?.telegram?.chat_id;

    if (hasTransport) {
      return {
        name: 'Takopi Config',
        status: 'pass',
        message: 'Takopi config found with Telegram credentials',
      };
    }

    return {
      name: 'Takopi Config',
      status: 'warn',
      message: 'Takopi config found but missing Telegram credentials',
      guidance: 'Configure Telegram transport in ~/.takopi/takopi.toml or .takopi-smithers/config.toml',
    };
  } catch (error) {
    return {
      name: 'Takopi Config',
      status: 'warn',
      message: `Failed to read Takopi config: ${error}`,
      guidance: 'Run "takopi --onboard" to configure Takopi',
    };
  }
}

async function checkTelegramConnection(): Promise<CheckResult> {
  try {
    const config = await loadConfig('.takopi-smithers/config.toml');

    // Get credentials (from config or takopi config)
    const botToken = config.telegram.bot_token;
    const chatId = config.telegram.chat_id;

    // If no credentials in local config, try takopi config
    let finalBotToken = botToken;
    let finalChatId = chatId;

    if (!finalBotToken || !finalChatId) {
      const takopiConfig = await loadTakopiConfig();
      if (takopiConfig?.transports?.telegram) {
        finalBotToken = takopiConfig.transports.telegram.bot_token || '';
        finalChatId = takopiConfig.transports.telegram.chat_id || 0;
      }
    }

    if (!finalBotToken || !finalChatId) {
      return {
        name: 'Telegram Connection',
        status: 'warn',
        message: 'No Telegram credentials configured',
        guidance: 'Configure bot_token and chat_id in .takopi-smithers/config.toml or ~/.takopi/takopi.toml',
      };
    }

    // Try to send a test message
    const testMessage = '🩺 takopi-smithers doctor: Telegram connection test';
    await sendTelegramMessage(finalBotToken, finalChatId, testMessage, false);

    return {
      name: 'Telegram Connection',
      status: 'pass',
      message: 'Successfully sent test message to Telegram',
    };
  } catch (error) {
    return {
      name: 'Telegram Connection',
      status: 'fail',
      message: `Failed to send Telegram message: ${error}`,
      guidance: 'Verify bot_token and chat_id are correct. Check network connection.',
    };
  }
}

function printResults(results: CheckResult[]): void {
  for (const result of results) {
    const icon =
      result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️ ' : '❌';
    console.log(`${icon} ${result.name}: ${result.message}`);

    if (result.guidance) {
      console.log(`   💡 ${result.guidance}`);
    }
  }
}
