# Worktree Support

takopi-smithers supports running independent workflows for each git worktree/branch.

## Quick Start

1. Create a git worktree:
   ```bash
   git worktree add ../myrepo-feature feature-branch
   cd ../myrepo-feature
   ```

2. Initialize takopi-smithers:
   ```bash
   takopi-smithers init  # Auto-detects worktree
   ```

3. Configure Telegram thread (optional but recommended):
   Edit `.takopi-smithers/worktrees/feature-branch/config.toml`:
   ```toml
   [telegram]
   bot_token = ""  # Leave empty to use ~/.takopi/takopi.toml
   chat_id = 0     # Leave 0 to use ~/.takopi/takopi.toml
   message_thread_id = 12345  # Set to Telegram topic/thread ID
   ```

4. Start the supervisor:
   ```bash
   takopi-smithers start
   ```

## How It Works

- Each worktree gets its own isolated config, workflow, database, and logs
- Paths:
  - Main: `.takopi-smithers/config.toml`, `.smithers/workflow.tsx`, `.smithers/workflow.db`
  - Worktree: `.takopi-smithers/worktrees/<branch>/config.toml`, `.smithers/worktrees/<branch>/workflow.tsx`, etc.
- Multiple supervisors can run simultaneously (one per worktree)
- Telegram updates can post to different threads using `message_thread_id`

## Telegram Topics Integration

When using Takopi's workspace mode with Telegram topics:

1. Create a Telegram topic/thread for each branch
2. Get the message_thread_id (it's in the URL when you open the topic)
3. Set it in the worktree config:
   ```toml
   [telegram]
   message_thread_id = 12345
   ```
4. Status updates will post to that specific thread

## Commands

All commands support `--worktree <branch-name>`:

```bash
# From main repo, manage feature branch
takopi-smithers status --worktree feature-branch
takopi-smithers logs --worktree feature-branch --follow
takopi-smithers restart --worktree feature-branch
takopi-smithers stop --worktree feature-branch
```

Or cd to the worktree directory for automatic detection:

```bash
cd ../myrepo-feature
takopi-smithers status  # Auto-detects feature-branch
```

## Bulk Operations

The `--all-worktrees` flag allows you to operate on all configured worktrees simultaneously:

### Starting All Worktrees

```bash
takopi-smithers start --all-worktrees
```

This will:
1. Scan all git worktrees in the repository
2. Check which ones have a `.takopi-smithers/worktrees/<branch>/config.toml`
3. Spawn a separate supervisor process for each configured worktree
4. Report which worktrees were successfully started

### Viewing All Statuses

```bash
takopi-smithers status --all-worktrees
```

Displays a formatted table:
```
┌─────────────────────┬──────────────┬──────────────────┬─────────────────────────────┐
│ Worktree            │ Status       │ Heartbeat        │ Summary                     │
├─────────────────────┼──────────────┼──────────────────┼─────────────────────────────┤
│ main                │ running      │ 5 seconds ago ✅ │ Planning next task          │
│ feature-auth        │ running      │ 12 seconds ago ✅│ Implementing login flow     │
│ feature-dashboard   │ idle         │ —                │ Workflow not started        │
└─────────────────────┴──────────────┴──────────────────┴─────────────────────────────┘
```

### Restarting All Supervisors

```bash
takopi-smithers restart --all-worktrees
```

Sends SIGUSR1 signal to all running supervisor processes.

### Stopping All Supervisors

```bash
takopi-smithers stop --all-worktrees
```

Gracefully stops all supervisors. Add `--keep-takopi` if you want to keep Takopi processes running.

### Flag Validation

The `--all-worktrees` and `--worktree <name>` flags are mutually exclusive. If you try to use both:

```bash
takopi-smithers start --worktree main --all-worktrees
# Error: Cannot use both --worktree and --all-worktrees flags together
```

## Troubleshooting

- **"Worktree not found"**: Ensure the worktree exists (`git worktree list`)
- **Config not found**: Run `takopi-smithers init --worktree <name>` first
- **Logs not found**: Start the supervisor first with `takopi-smithers start`

## Use Cases

### Parallel Development

Work on multiple features simultaneously with isolated workflows:

```bash
# Main branch: stable production workflow
cd myrepo
takopi-smithers start

# Feature A: experimental feature
cd ../myrepo-feature-a
takopi-smithers start

# Feature B: another experimental feature
cd ../myrepo-feature-b
takopi-smithers start
```

Each workflow runs independently with its own status tracking and Telegram updates.

### Topic-Per-Branch in Telegram

Map each branch to a Telegram topic for organized communication:

1. Create Telegram topics: "Main", "Feature A", "Feature B"
2. Configure each worktree with the appropriate `message_thread_id`
3. All status updates post to the correct topic automatically

This gives you a clean "topic = branch" organization in Telegram, matching the SPEC.md vision (line 588).
