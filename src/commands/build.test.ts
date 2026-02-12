import { test, expect } from 'bun:test';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';

test('dist directory structure after build', async () => {
  // This test assumes build has been run
  // In CI, this runs after 'bun run build'

  if (!existsSync('dist')) {
    console.warn('⚠️  dist/ not found - skipping build test (run "bun run build" first)');
    return;
  }

  // Check for compiled CLI
  expect(existsSync('dist/cli.js')).toBe(true);

  // Check for type declarations
  const files = await readdir('dist', { recursive: true });
  const hasDts = files.some(f => f.endsWith('.d.ts'));
  expect(hasDts).toBe(true);

  // Check for source maps
  const hasSourceMaps = files.some(f => f.endsWith('.js.map'));
  expect(hasSourceMaps).toBe(true);
});

test('CLI entry point has correct shebang', async () => {
  if (!existsSync('dist/cli.js')) {
    console.warn('⚠️  dist/cli.js not found - skipping shebang test');
    return;
  }

  const content = await Bun.file('dist/cli.js').text();

  // TypeScript should preserve the shebang from src/cli.ts
  expect(content.startsWith('#!/usr/bin/env bun')).toBe(true);
});
