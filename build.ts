#!/usr/bin/env bun
import { $ } from 'bun';
import { rmSync, chmodSync } from 'node:fs';

console.log('🧹 Cleaning dist/...');
rmSync('dist', { recursive: true, force: true });

console.log('📦 Building CLI with Bun.build()...');
// Build the CLI executable
await Bun.build({
  entrypoints: ['./src/cli.ts'],
  outdir: './dist',
  target: 'bun',
  format: 'esm',
  minify: false,
  sourcemap: 'external',
});

console.log('📦 Building library with Bun.build()...');
// Build the library entry point
await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  target: 'bun',
  format: 'esm',
  minify: false,
  sourcemap: 'external',
});

console.log('🔧 Setting executable permissions on CLI...');
chmodSync('./dist/cli.js', 0o755);

console.log('📝 Generating TypeScript declarations...');
await $`tsc --project tsconfig.build.json --emitDeclarationOnly`;

console.log('✅ Build complete!');
