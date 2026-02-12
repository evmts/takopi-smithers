#!/usr/bin/env bun
import { $ } from 'bun';
import { rmSync } from 'node:fs';

console.log('🧹 Cleaning dist/...');
rmSync('dist', { recursive: true, force: true });

console.log('📦 Building with TypeScript compiler...');
await $`tsc --project tsconfig.build.json`;

console.log('✅ Build complete!');
