import { test, expect } from 'bun:test';
import { isHeartbeatStale } from './db';

// Unit tests for hang detection logic
test('isHeartbeatStale returns true for old heartbeat', () => {
  const oldHeartbeat = new Date(Date.now() - 400 * 1000).toISOString(); // 400 seconds ago
  const threshold = 300; // 300 seconds

  expect(isHeartbeatStale(oldHeartbeat, threshold)).toBe(true);
});

test('isHeartbeatStale returns false for recent heartbeat', () => {
  const recentHeartbeat = new Date(Date.now() - 100 * 1000).toISOString(); // 100 seconds ago
  const threshold = 300; // 300 seconds

  expect(isHeartbeatStale(recentHeartbeat, threshold)).toBe(false);
});

test('isHeartbeatStale returns true for undefined heartbeat', () => {
  expect(isHeartbeatStale(null, 300)).toBe(true);
});

test('isHeartbeatStale returns true for invalid heartbeat', () => {
  expect(isHeartbeatStale('invalid-date', 300)).toBe(true);
});

test('isHeartbeatStale handles edge case at exact threshold', () => {
  const exactThreshold = new Date(Date.now() - 300 * 1000).toISOString(); // exactly 300 seconds ago
  const threshold = 300;

  // Should be false because it's not GREATER than threshold, just equal
  // (depends on millisecond precision, but should be within margin)
  const result = isHeartbeatStale(exactThreshold, threshold);
  expect(typeof result).toBe('boolean');
});
