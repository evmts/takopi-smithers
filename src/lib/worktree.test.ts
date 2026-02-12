import { test, expect, describe } from "bun:test";
import {
  getWorktreeConfigPath,
  getWorktreeDbPath,
  getWorktreeWorkflowPath,
  getWorktreeLogsPath,
  parseWorktreeListOutput,
  type Worktree,
} from "./worktree";

describe("Worktree path helpers", () => {
  test("getWorktreeConfigPath - main worktree", () => {
    const mainWorktree: Worktree = {
      path: "/repo",
      branch: "main",
      isMain: true,
      commitHash: "abc123",
    };

    expect(getWorktreeConfigPath(mainWorktree)).toBe(
      ".takopi-smithers/config.toml"
    );
  });

  test("getWorktreeConfigPath - feature branch", () => {
    const featureWorktree: Worktree = {
      path: "/repo-feature",
      branch: "feature/new-ui",
      isMain: false,
      commitHash: "def456",
    };

    expect(getWorktreeConfigPath(featureWorktree)).toBe(
      ".takopi-smithers/worktrees/feature_new-ui/config.toml"
    );
  });

  test("getWorktreeDbPath - main worktree", () => {
    const mainWorktree: Worktree = {
      path: "/repo",
      branch: "main",
      isMain: true,
      commitHash: "abc123",
    };

    expect(getWorktreeDbPath(mainWorktree)).toBe(".smithers/workflow.db");
  });

  test("getWorktreeDbPath - feature branch", () => {
    const featureWorktree: Worktree = {
      path: "/repo-feature",
      branch: "feature/api-refactor",
      isMain: false,
      commitHash: "def456",
    };

    expect(getWorktreeDbPath(featureWorktree)).toBe(
      ".smithers/worktrees/feature_api-refactor/workflow.db"
    );
  });

  test("getWorktreeWorkflowPath - main worktree", () => {
    const mainWorktree: Worktree = {
      path: "/repo",
      branch: "main",
      isMain: true,
      commitHash: "abc123",
    };

    expect(getWorktreeWorkflowPath(mainWorktree)).toBe(
      ".smithers/workflow.tsx"
    );
  });

  test("getWorktreeWorkflowPath - feature branch", () => {
    const featureWorktree: Worktree = {
      path: "/repo-feature",
      branch: "bugfix/login-error",
      isMain: false,
      commitHash: "def456",
    };

    expect(getWorktreeWorkflowPath(featureWorktree)).toBe(
      ".smithers/worktrees/bugfix_login-error/workflow.tsx"
    );
  });

  test("getWorktreeLogsPath - main worktree", () => {
    const mainWorktree: Worktree = {
      path: "/repo",
      branch: "main",
      isMain: true,
      commitHash: "abc123",
    };

    expect(getWorktreeLogsPath(mainWorktree)).toBe(
      ".takopi-smithers/logs"
    );
  });

  test("getWorktreeLogsPath - feature branch", () => {
    const featureWorktree: Worktree = {
      path: "/repo-feature",
      branch: "feature/dark-mode",
      isMain: false,
      commitHash: "def456",
    };

    expect(getWorktreeLogsPath(featureWorktree)).toBe(
      ".takopi-smithers/worktrees/feature_dark-mode/logs"
    );
  });

  test("sanitizes branch names with special characters", () => {
    const complexWorktree: Worktree = {
      path: "/repo-complex",
      branch: "feat/issue-#123/fix@email",
      isMain: false,
      commitHash: "xyz789",
    };

    expect(getWorktreeConfigPath(complexWorktree)).toBe(
      ".takopi-smithers/worktrees/feat_issue-_123_fix_email/config.toml"
    );
  });
});

describe('parseWorktreeListOutput', () => {
  test('parseWorktreeListOutput - single worktree', () => {
    const output = `worktree /Users/dev/myrepo
HEAD abc123
branch refs/heads/main
`;

    const result = parseWorktreeListOutput(output);

    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe('/Users/dev/myrepo');
    expect(result[0]?.branch).toBe('main');
    expect(result[0]?.commitHash).toBe('abc123');
    expect(result[0]?.isMain).toBe(true);
  });

  test('parseWorktreeListOutput - multiple worktrees', () => {
    const output = `worktree /Users/dev/myrepo
HEAD abc123
branch refs/heads/main

worktree /Users/dev/myrepo-feature
HEAD def456
branch refs/heads/feature-branch
`;

    const result = parseWorktreeListOutput(output);

    expect(result).toHaveLength(2);
    expect(result[0]?.isMain).toBe(true);
    expect(result[1]?.isMain).toBe(false);
    expect(result[1]?.branch).toBe('feature-branch');
  });

  test('parseWorktreeListOutput - detached HEAD', () => {
    const output = `worktree /Users/dev/myrepo
HEAD abc123
branch refs/heads/main

worktree /Users/dev/myrepo-detached
HEAD def4567890
detached
`;

    const result = parseWorktreeListOutput(output);

    expect(result).toHaveLength(2);
    expect(result[1]?.branch).toBe('detached@def4567');
  });
});
