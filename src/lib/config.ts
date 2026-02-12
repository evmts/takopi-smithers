import { z } from 'zod';

export type AutoHealEngine = 'claude' | 'codex' | 'opencode' | 'pi';

const AutoHealEngineSchema = z.enum(['claude', 'codex', 'opencode', 'pi']);

const ConfigSchema = z.object({
  version: z.number(),
  workflow: z.object({
    script: z.string(),
    db: z.string(),
    input: z.any().optional(),
  }),
  updates: z.object({
    enabled: z.boolean(),
    interval_seconds: z.number(),
  }),
  health: z.object({
    heartbeat_key: z.string(),
    heartbeat_write_interval_seconds: z.number(),
    hang_threshold_seconds: z.number(),
    restart_backoff_seconds: z.array(z.number()),
    max_restart_attempts: z.number(),
  }),
  takopi: z.object({
    engine: z.enum(['claude', 'codex', 'opencode', 'pi']).default('codex'),
  }).optional(),
  telegram: z.object({
    bot_token: z.string(),
    chat_id: z.number(),
    message_thread_id: z.number().optional(),
  }),
  autoheal: z.object({
    enabled: z.boolean(),
    engine: AutoHealEngineSchema,
    max_attempts: z.number(),
  }),
  worktree: z.object({
    name: z.string(),
    branch: z.string(),
  }).optional(),
});

const TakopiConfigSchema = z.object({
  default_engine: z.string().optional(),
  transports: z.object({
    telegram: z.object({
      bot_token: z.string().optional(),
      chat_id: z.number().optional(),
    }).optional(),
  }).optional(),
}).optional();

export interface Config {
  version: number;
  workflow: {
    script: string;
    db: string;
    input?: Record<string, unknown>;
  };
  updates: {
    enabled: boolean;
    interval_seconds: number;
  };
  health: {
    heartbeat_key: string;
    heartbeat_write_interval_seconds: number;
    hang_threshold_seconds: number;
    restart_backoff_seconds: number[];
    max_restart_attempts: number;
  };
  takopi?: {
    engine: 'claude' | 'codex' | 'opencode' | 'pi';
  };
  telegram: {
    bot_token: string;
    chat_id: number;
    message_thread_id?: number;
  };
  autoheal: {
    enabled: boolean;
    engine: AutoHealEngine;
    max_attempts: number;
  };
  worktree?: {
    name: string;
    branch: string;
  };
}

export interface WorktreeConfig extends Config {
  worktree: {
    name: string;
    branch: string;
  };
}

export interface TakopiConfig {
  default_engine?: string;
  transports?: {
    telegram?: {
      bot_token?: string;
      chat_id?: number;
    };
  };
}

export interface TelegramCredentials {
  botToken: string;
  chatId: number;
  messageThreadId?: number;
}

export async function loadConfig(path?: string): Promise<Config> {
  // If no path specified, try auto-detecting worktree config first
  if (!path) {
    const { getCurrentWorktree, getWorktreeConfigPath } = await import('./worktree');
    const currentWorktree = await getCurrentWorktree();

    if (currentWorktree && !currentWorktree.isMain) {
      const worktreeConfigPath = getWorktreeConfigPath(currentWorktree);
      const exists = await Bun.file(worktreeConfigPath).exists();

      if (exists) {
        console.log(`📍 Detected worktree: ${currentWorktree.branch}`);
        path = worktreeConfigPath;
      }
    }

    // Fall back to main config
    path = path || '.takopi-smithers/config.toml';
  }

  const content = await Bun.file(path).text();
  const TOML = await import("@iarna/toml");
  const parsed = TOML.parse(content);
  return ConfigSchema.parse(parsed);
}

export async function loadTakopiConfig(path: string = `${process.env.HOME}/.takopi/takopi.toml`): Promise<TakopiConfig | null> {
  try {
    const content = await Bun.file(path).text();
    const TOML = await import("@iarna/toml");
    const parsed = TOML.parse(content);
    return TakopiConfigSchema.parse(parsed) || null;
  } catch {
    return null;
  }
}

export async function loadWorktreeConfig(worktreeName?: string): Promise<Config> {
  if (!worktreeName) {
    // Auto-detect from current git worktree
    const { getCurrentWorktree, getWorktreeConfigPath } = await import("./worktree");
    const currentWorktree = await getCurrentWorktree();

    if (currentWorktree && !currentWorktree.isMain) {
      const configPath = getWorktreeConfigPath(currentWorktree);
      const configExists = await Bun.file(configPath).exists();

      if (configExists) {
        return loadConfig(configPath);
      }
    }

    // Fall back to main config
    return loadConfig();
  }

  // Load config for specific worktree by name
  const { findWorktreeByName, getWorktreeConfigPath } = await import("./worktree");
  const worktree = await findWorktreeByName(worktreeName);

  if (!worktree) {
    throw new Error(`Worktree '${worktreeName}' not found`);
  }

  const configPath = getWorktreeConfigPath(worktree);
  const configExists = await Bun.file(configPath).exists();

  if (!configExists) {
    throw new Error(`Config file not found for worktree '${worktreeName}' at ${configPath}`);
  }

  return loadConfig(configPath);
}

export async function getTelegramCredentials(config: Config): Promise<TelegramCredentials | null> {
  // Use config values if provided
  if (config.telegram.bot_token && config.telegram.chat_id) {
    return {
      botToken: config.telegram.bot_token,
      chatId: config.telegram.chat_id,
      messageThreadId: config.telegram.message_thread_id,
    };
  }

  // Fallback to takopi config
  const takopiConfig = await loadTakopiConfig();
  if (takopiConfig?.transports?.telegram?.bot_token && takopiConfig?.transports?.telegram?.chat_id) {
    return {
      botToken: takopiConfig.transports.telegram.bot_token,
      chatId: takopiConfig.transports.telegram.chat_id,
    };
  }

  return null;
}
