import { test, expect, describe } from 'bun:test';
import { parseArgs } from './args';

describe('parseArgs', () => {
  test('parses command', () => {
    const result = parseArgs(['init']);
    expect(result.command).toBe('init');
    expect(result.flags).toEqual({});
    expect(result.positionals).toEqual([]);
  });

  test('parses long flags', () => {
    const result = parseArgs(['--help']);
    expect(result.flags.help).toBe(true);
  });

  test('parses short flags', () => {
    const result = parseArgs(['-h']);
    expect(result.flags.h).toBe(true);
  });

  test('parses command with flags', () => {
    const result = parseArgs(['init', '--dry-run']);
    expect(result.command).toBe('init');
    expect(result.flags['dry-run']).toBe(true);
  });

  test('parses flags with values', () => {
    const result = parseArgs(['start', '--config', 'custom.toml']);
    expect(result.command).toBe('start');
    expect(result.flags.config).toBe('custom.toml');
  });

  test('parses positionals after command', () => {
    const result = parseArgs(['doctor', 'arg1', 'arg2']);
    expect(result.command).toBe('doctor');
    expect(result.positionals).toEqual(['arg1', 'arg2']);
  });

  test('handles empty args', () => {
    const result = parseArgs([]);
    expect(result.command).toBe(null);
    expect(result.flags).toEqual({});
    expect(result.positionals).toEqual([]);
  });

  test('parseArgs handles --keep-takopi flag', () => {
    const result = parseArgs(['stop', '--keep-takopi']);
    expect(result.command).toBe('stop');
    expect(result.flags['keep-takopi']).toBe(true);
  });

  test('validateFlags throws when --worktree and --all-worktrees are used together', () => {
    expect(() => {
      parseArgs(['start', '--worktree', 'main', '--all-worktrees']);
    }).toThrow('Cannot use both --worktree and --all-worktrees flags together');
  });

  test('validateFlags allows --worktree alone', () => {
    expect(() => {
      parseArgs(['start', '--worktree', 'main']);
    }).not.toThrow();
  });

  test('validateFlags allows --all-worktrees alone', () => {
    expect(() => {
      parseArgs(['start', '--all-worktrees']);
    }).not.toThrow();
  });
});
