# Troubleshooting Guide

Common issues and solutions for takopi-smithers.

## Installation Issues

### "bun: command not found"

**Cause:** Bun is not installed or not in PATH.

**Solution:**
```bash
curl -fsSL https://bun.sh/install | bash
# Then add to PATH (usually auto-added to ~/.bashrc or ~/.zshrc)
source ~/.bashrc
```

### "takopi: command not found"

**Cause:** Takopi is not installed or uv bin directory not in PATH.

**Solution:**
```bash
# Install uv first
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install takopi
uv tool install -U takopi

# Add uv bin directory to PATH
export PATH="$HOME/.local/bin:$PATH"
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
```

### "smithers-orchestrator: command not found"

**Cause:** Smithers dependencies not installed in the repo.

**Solution:**
```bash
bun add smithers smithers-orchestrator
```

## Configuration Issues

### "Takopi config not found"

**Cause:** Takopi hasn't been onboarded yet.

**Solution:**
```bash
takopi --onboard
```

This requires an interactive terminal (TTY) and will prompt for:
- Telegram bot token (from @BotFather)
- Telegram chat ID (your user ID or group ID)

### "Failed to parse config.toml"

**Cause:** TOML syntax error in `.takopi-smithers/config.toml`.

**Solution:**

1. Validate TOML syntax using an online validator
2. Or regenerate:
   ```bash
   bunx takopi-smithers init --force
   ```

### "Telegram credentials not configured"

**Cause:** Neither `.takopi-smithers/config.toml` nor `~/.takopi/takopi.toml` has valid `bot_token` and `chat_id`.

**Solution:**

Option 1 - Use Takopi's config:
```bash
takopi --onboard
```

Option 2 - Add to `.takopi-smithers/config.toml`:
```toml
[telegram]
bot_token = "123456:ABC-DEF..."
chat_id = 123456789
```

## Runtime Issues

### "Workflow keeps crashing immediately"

**Diagnosis:**

1. Check logs:
   ```bash
   tail -50 .takopi-smithers/logs/supervisor.log
   ```

2. Check workflow syntax:
   ```bash
   bunx tsc --noEmit .smithers/workflow.tsx
   ```

3. Check Smithers DB:
   ```bash
   bunx takopi-smithers status
   ```

**Common causes:**

- Syntax error in workflow.tsx
- Missing import in workflow.tsx
- Corrupted SQLite DB

**Solutions:**

- Fix syntax errors in `.smithers/workflow.tsx`
- Delete `.smithers/workflow.db` to start fresh (will lose state)
- Enable auto-heal to automatically fix crashes:
  ```toml
  [autoheal]
  enabled = true
  engine = "claude"
  ```

### "Heartbeat is stale"

**Cause:** Workflow is not updating `supervisor.heartbeat` in the DB.

**Diagnosis:**

```bash
# Check if heartbeat exists in DB
sqlite3 .smithers/workflow.db "SELECT * FROM state WHERE key = 'supervisor.heartbeat';"
```

**Solution:**

Add heartbeat to workflow (should be in template from `init`):

```tsx
import { db } from 'smithers';

setInterval(() => {
  db.state.set('supervisor.heartbeat', new Date().toISOString());
}, 30000); // Every 30 seconds
```

### "Auto-heal keeps failing"

**Diagnosis:**

1. Check which engine is configured:
   ```bash
   grep "engine" .takopi-smithers/config.toml
   ```

2. Check if the agent CLI is installed:
   ```bash
   # For Claude
   claude --version

   # For Codex
   codex --version

   # For OpenCode
   opencode --version

   # For Pi
   pi --version
   ```

3. Check agent CLI permissions:
   ```bash
   # For Claude
   claude -p "test prompt" .

   # For Codex
   codex exec --json "test prompt"
   ```

**Common causes:**

- Agent CLI not installed
- Agent CLI requires interactive approval for tools
- ANTHROPIC_API_KEY not set (for Claude, we intentionally set to empty to force subscription)

**Solutions:**

- Install the configured agent CLI
- Configure non-interactive permissions (see agent docs)
- Switch to a different engine:
  ```toml
  [autoheal]
  enabled = true
  engine = "codex"  # or "claude", "opencode", "pi"
  ```
- Disable auto-heal if not working:
  ```toml
  [autoheal]
  enabled = false
  ```

### "Auto-heal with Codex not working"

**Diagnosis:**

1. Ensure `codex` CLI is installed and on PATH:
   ```bash
   which codex
   codex --version
   ```

2. Test invocation:
   ```bash
   codex exec --json "echo hello"
   ```

3. Check logs for Codex-specific errors:
   ```bash
   grep -i "codex" .takopi-smithers/logs/supervisor.log
   ```

4. Verify JSONL parsing is working:
   ```bash
   grep "Parsed.*Codex events" .takopi-smithers/logs/supervisor.log
   ```

**Common causes:**

- Codex not installed or not in PATH
- Codex `exec --json` not outputting valid JSONL
- Network/API issues with Codex backend
- Codex requires interactive approval

**Solutions:**

- Install Codex (see Takopi docs: https://takopi.dev/tutorials/install/)
- Configure Codex permissions for non-interactive use
- Switch to Claude adapter temporarily:
  ```toml
  [autoheal]
  enabled = true
  engine = "claude"
  ```
- Check Codex logs for errors:
  ```bash
  cat .takopi-smithers/autoheal-prompt-codex.txt
  ```

### "Telegram messages not sending"

**Diagnosis:**

```bash
bunx takopi-smithers doctor
```

Look for the "Telegram Connection" check result.

**Common causes:**

- Invalid bot token
- Invalid chat ID
- Network/firewall blocking Telegram API
- Bot blocked by user or kicked from group

**Solutions:**

1. Verify bot token with @BotFather on Telegram
2. Verify chat ID:
   ```bash
   # Send a message to the bot, then:
   curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates"
   # Look for "chat":{"id":123456789}
   ```
3. Check network access to `api.telegram.org`
4. Re-add bot to group if kicked

### "Workflow file changes not triggering restart"

**Diagnosis:**

Check if file watcher started:
```bash
grep "Starting file watcher" .takopi-smithers/logs/supervisor.log
```

**Common causes:**

- File watcher failed to start (permissions, missing file)
- Debounce window still active (wait 2 seconds after edit)

**Solutions:**

- Manually restart: `bunx takopi-smithers restart`
- Check file exists: `ls -la .smithers/workflow.tsx`
- Wait 2+ seconds after editing before expecting restart

## Database Issues

### "SQLite database is locked"

**Cause:** Another process has the DB open (Smithers runner or manual sqlite3).

**Solution:**

1. Stop the supervisor:
   ```bash
   bunx takopi-smithers stop
   ```

2. Wait a few seconds for processes to exit

3. If still locked, find and kill processes:
   ```bash
   lsof .smithers/workflow.db
   kill <PID>
   ```

### "Corrupted database"

**Symptoms:**
- Workflow crashes with SQLite errors
- `bunx takopi-smithers status` fails

**Solution:**

**DANGER:** This will lose all workflow state!

```bash
bunx takopi-smithers stop
mv .smithers/workflow.db .smithers/workflow.db.backup
bunx takopi-smithers start
```

The workflow will start fresh. If the workflow is designed to be resumable, it should handle this gracefully.

## Process Management Issues

### "Supervisor won't stop"

**Cause:** Process stuck or not responding to signals.

**Solution:**

```bash
# Find supervisor process
ps aux | grep "takopi-smithers.*start"

# Kill forcefully
kill -9 <PID>

# Clean up child processes
pkill -f takopi
pkill -f smithers-orchestrator
```

### "Multiple supervisors running"

**Cause:** Started multiple times without stopping previous instance.

**Solution:**

```bash
# Stop all instances
bunx takopi-smithers stop
# Or manually:
pkill -f "takopi-smithers.*start"

# Verify all stopped
ps aux | grep takopi-smithers

# Start fresh
bunx takopi-smithers start
```

### "Can't find running supervisor for restart"

**Cause:** Supervisor is not running.

**Solution:**

```bash
# Just start it
bunx takopi-smithers start
```

## Performance Issues

### "High CPU usage"

**Diagnosis:**

```bash
top -p $(pgrep -f smithers-orchestrator)
```

**Common causes:**

- Workflow has infinite loop
- Workflow is doing expensive operations (large file processing, etc.)
- Too frequent heartbeat updates

**Solutions:**

- Review workflow logic for loops
- Add delays/sleeps in workflow
- Increase heartbeat interval to 60s instead of 30s

### "High memory usage"

**Common causes:**

- Large data structures in workflow state
- SQLite DB growing very large
- Memory leak in workflow

**Solutions:**

- Clear old data from DB periodically
- Use streaming/chunking for large data
- Restart workflow periodically (cron job)

## Codespaces-Specific Issues

### "Codespace keeps stopping"

**Cause:** Default idle timeout (30 minutes).

**Solution:**

Increase timeout in GitHub Settings → Codespaces → Default idle timeout (up to 4 hours for free tier).

Or run a keep-alive script:
```bash
while true; do date >> .keepalive; sleep 900; done &
```

### "Takopi config not persisting across rebuilds"

**Cause:** The mount in `.devcontainer/devcontainer.json` may not be working.

**Solution:**

Verify mount exists:
```bash
ls -la ~/.takopi/
```

If not mounted, manually copy config:
```bash
mkdir -p ~/.takopi
cp /path/to/local/takopi.toml ~/.takopi/
```

### "uv: command not found in codespace"

**Cause:** `.devcontainer/setup.sh` failed or PATH not updated.

**Solution:**

```bash
# Reinstall uv
pip install --user uv

# Add to PATH
export PATH="$HOME/.local/bin:$PATH"
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
```

## Getting Help

### Run Doctor Command

Always start with:
```bash
bunx takopi-smithers doctor
```

This checks:
- ✅ Bun installation
- ✅ Git repository
- ✅ Smithers dependencies
- ✅ Config file syntax
- ✅ SQLite path writable
- ✅ Takopi config
- ✅ Telegram connection

### Enable Debug Logging

Add to workflow for more verbose output:
```tsx
console.log('[DEBUG]', 'Current state:', db.state.get('supervisor.status'));
```

### Collect Diagnostic Info

When reporting issues, include:

```bash
# System info
bun --version
uv --version
takopi --version

# Config
cat .takopi-smithers/config.toml

# Recent logs
tail -100 .takopi-smithers/logs/supervisor.log

# DB state
sqlite3 .smithers/workflow.db "SELECT * FROM state;"

# Doctor output
bunx takopi-smithers doctor
```

### Community Resources

- Takopi GitHub: https://github.com/banteg/takopi
- Smithers Docs: https://smithers.sh
- Bun Docs: https://bun.sh/docs
