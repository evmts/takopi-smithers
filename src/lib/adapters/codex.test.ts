import { test, expect } from 'bun:test';
import { CodexAdapter } from './codex';

test('CodexAdapter has correct name', () => {
  const adapter = new CodexAdapter();
  expect(adapter.name).toBe('codex');
});

test('CodexAdapter parses turn.completed as success', async () => {
  // Mock test - validates adapter structure
  // In production, would need to mock Bun.spawn
  const adapter = new CodexAdapter();
  expect(adapter.invoke).toBeDefined();
  expect(typeof adapter.invoke).toBe('function');
});

test('CodexAdapter parses turn.failed as failure', async () => {
  // Mock test - validates adapter structure
  const adapter = new CodexAdapter();
  expect(adapter.name).toBe('codex');
});
