import { log } from "./logger";

export interface Worktree {
  path: string;
  branch: string;
  isMain: boolean;
  commitHash: string;
}

/**
 * List all git worktrees in the repository
 * Parses output of `git worktree list --porcelain`
 */
export async function listWorktrees(): Promise<Worktree[]> {
  try {
    const result = Bun.spawnSync(["git", "worktree", "list", "--porcelain"], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });

    if (result.exitCode !== 0) {
      throw new Error(`git worktree list failed: ${result.stderr?.toString()}`);
    }

    const output = result.stdout?.toString() || "";
    return parseWorktreeListOutput(output);
  } catch (error) {
    await log(`Failed to list worktrees: ${error}`, "error");
    return [];
  }
}

/**
 * Parse the porcelain output of `git worktree list`
 */
export function parseWorktreeListOutput(output: string): Worktree[] {
  const worktrees: Worktree[] = [];
  const lines = output.split("\n").filter((line) => line.trim() !== "");

  let currentWorktree: Partial<Worktree> = {};

  for (const line of lines) {
    if (line.startsWith("worktree ")) {
      // Save previous worktree if complete
      if (currentWorktree.path && currentWorktree.branch && currentWorktree.commitHash !== undefined) {
        worktrees.push(currentWorktree as Worktree);
      }
      // Start new worktree
      currentWorktree = {
        path: line.substring("worktree ".length),
        isMain: false,
      };
    } else if (line.startsWith("HEAD ")) {
      currentWorktree.commitHash = line.substring("HEAD ".length);
    } else if (line.startsWith("branch ")) {
      const branchRef = line.substring("branch ".length);
      // Extract branch name from refs/heads/branch-name
      currentWorktree.branch = branchRef.replace("refs/heads/", "");
    } else if (line === "bare") {
      // Skip bare repositories
      currentWorktree = {};
    } else if (line === "detached") {
      // Detached HEAD state - use commit hash as branch name
      currentWorktree.branch = `detached@${currentWorktree.commitHash?.substring(0, 7) || "unknown"}`;
    }
  }

  // Save last worktree
  if (currentWorktree.path && currentWorktree.branch && currentWorktree.commitHash !== undefined) {
    worktrees.push(currentWorktree as Worktree);
  }

  // Mark the first worktree as main
  if (worktrees.length > 0) {
    worktrees[0]!.isMain = true;
  }

  return worktrees;
}

/**
 * Get the current worktree based on the current working directory
 */
export async function getCurrentWorktree(): Promise<Worktree | null> {
  const worktrees = await listWorktrees();
  const cwd = process.cwd();

  // Find worktree that matches current directory
  const current = worktrees.find((wt) => {
    // Normalize paths for comparison
    const wtPath = wt.path.replace(/\/$/, "");
    const cwdPath = cwd.replace(/\/$/, "");
    return cwdPath.startsWith(wtPath);
  });

  return current || null;
}

/**
 * Find a worktree by name (branch name)
 */
export async function findWorktreeByName(name: string): Promise<Worktree | null> {
  const worktrees = await listWorktrees();
  return worktrees.find((wt) => wt.branch === name) || null;
}

/**
 * Get the config path for a specific worktree
 */
export function getWorktreeConfigPath(worktree: Worktree): string {
  if (worktree.isMain) {
    return ".takopi-smithers/config.toml";
  }
  // Sanitize branch name for filesystem
  const safeBranchName = worktree.branch.replace(/[^a-zA-Z0-9-_]/g, "_");
  return `.takopi-smithers/worktrees/${safeBranchName}/config.toml`;
}

/**
 * Get the database path for a specific worktree
 */
export function getWorktreeDbPath(worktree: Worktree): string {
  if (worktree.isMain) {
    return ".smithers/workflow.db";
  }
  const safeBranchName = worktree.branch.replace(/[^a-zA-Z0-9-_]/g, "_");
  return `.smithers/worktrees/${safeBranchName}/workflow.db`;
}

/**
 * Get the workflow script path for a specific worktree
 */
export function getWorktreeWorkflowPath(worktree: Worktree): string {
  if (worktree.isMain) {
    return ".smithers/workflow.tsx";
  }
  const safeBranchName = worktree.branch.replace(/[^a-zA-Z0-9-_]/g, "_");
  return `.smithers/worktrees/${safeBranchName}/workflow.tsx`;
}

/**
 * Get the logs directory for a specific worktree
 */
export function getWorktreeLogsPath(worktree: Worktree): string {
  if (worktree.isMain) {
    return ".takopi-smithers/logs";
  }
  const safeBranchName = worktree.branch.replace(/[^a-zA-Z0-9-_]/g, "_");
  return `.takopi-smithers/worktrees/${safeBranchName}/logs`;
}

/**
 * Check if we're in a git repository
 */
export async function isGitRepository(): Promise<boolean> {
  const gitConfigExists = await Bun.file(".git/config").exists();
  const gitFileExists = await Bun.file(".git").exists();
  return gitConfigExists || gitFileExists;
}
