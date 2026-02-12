import type { AutoHealAdapter } from './base';
import { ClaudeCodeAdapter } from './claude';
import { CodexAdapter } from './codex';
import { OpenCodeAdapter } from './opencode';
import { PiAdapter } from './pi';

const adapters: Record<string, AutoHealAdapter> = {
  claude: new ClaudeCodeAdapter(),
  codex: new CodexAdapter(),
  opencode: new OpenCodeAdapter(),
  pi: new PiAdapter(),
};

export function getAdapter(engine: string): AutoHealAdapter | null {
  return adapters[engine] || null;
}

export type { AutoHealAdapter };
export * from './claude';
export * from './codex';
export * from './opencode';
export * from './pi';
