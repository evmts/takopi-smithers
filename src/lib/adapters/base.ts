import type { AutoHealContext, AutoHealResult } from '../autoheal';

export interface AutoHealAdapter {
  name: string;
  invoke(prompt: string, workflowScript: string, context: AutoHealContext): Promise<AutoHealResult>;
}
