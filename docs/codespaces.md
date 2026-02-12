# Using takopi-smithers in GitHub Codespaces

GitHub Codespaces provides a cloud-based development environment that's perfect for running takopi-smithers, since:

- Takopi polls Telegram outbound (no inbound webhooks required)
- Smithers runs locally inside the codespace
- You get an always-on environment if you keep the codespace alive
- All dependencies (Bun, Python, uv, Takopi) are pre-installed

## Quick Start

1. **Create a Codespace** from your repository
   - Click "Code" → "Codespaces" → "Create codespace on main"
   - Wait for container to build (first time takes ~2-3 minutes)

2. **Configure Takopi** (one-time setup)
   ```bash
   takopi --onboard
   ```

   You'll need:
   - A Telegram bot token (get from [@BotFather](https://t.me/BotFather))
   - Your Telegram chat ID (get from [@userinfobot](https://t.me/userinfobot))

   This creates `~/.takopi/takopi.toml` with your credentials.

3. **Initialize takopi-smithers**
   ```bash
   bunx takopi-smithers init
   ```

4. **Start the supervisor**
   ```bash
   bunx takopi-smithers start
   ```

5. **Message your Telegram bot** to control the workflow!

## Keeping the Codespace Alive

By default, Codespaces stop after 30 minutes of inactivity. To keep your workflow running:

### Option 1: Keep Terminal Active
- The codespace stays alive while the `takopi-smithers start` process is running
- Don't close the terminal or stop the process
- GitHub will keep the codespace running as long as there's an active process

### Option 2: Adjust Timeout Settings
- Go to your [Codespaces settings](https://github.com/settings/codespaces)
- Increase the "Default idle timeout" (max 4 hours for free tier)
- Pro/Enterprise accounts can set longer timeouts

### Option 3: Use Background Process + tmux
```bash
# Install tmux (if not already installed)
sudo apt-get update && sudo apt-get install -y tmux

# Start a tmux session
tmux new -s takopi-smithers

# Inside tmux, start the supervisor
bunx takopi-smithers start

# Detach from tmux: Ctrl+B, then D
# Reattach later: tmux attach -t takopi-smithers
```

### Option 4: GitHub Actions (Advanced)
For truly always-on workflows, consider:
- Setting up a self-hosted runner or cloud VM
- Using GitHub Actions scheduled workflows to restart if stopped
- This is beyond the scope of this guide but documented in the main README

## Expected Caveats and Workarounds

### 1. TTY Requirements for Initial Setup

**Problem:** `takopi --onboard` requires an interactive terminal (TTY)

**Solution:** Run the onboarding in the Codespaces terminal (it has full TTY support)

### 2. Secrets and Credentials

**Problem:** Telegram bot tokens are sensitive

**Solutions:**
- Store in `~/.takopi/takopi.toml` (gitignored by default)
- Or use Codespaces secrets:
  1. Go to repo Settings → Secrets → Codespaces
  2. Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`
  3. Access via environment variables in `.takopi-smithers/config.toml`

### 3. Agent CLI Permissions

**Problem:** Claude Code and other agents may require permission configuration for non-interactive use

**Solutions:**
- For Claude Code: Set `ANTHROPIC_API_KEY=""` to force subscription auth (see auto-heal implementation)
- For Codex: Ensure API keys are configured via environment variables
- For OpenCode: Configure `opencode.json` in project root

### 4. File Persistence

**Problem:** Codespace storage is temporary by default

**Solution:** All important state is in:
- `.smithers/workflow.db` (SQLite, persisted in repo)
- `.takopi-smithers/logs/*` (can be gitignored)
- Workflow and config files (tracked in git)

Commit and push changes regularly to avoid data loss if codespace is deleted.

### 5. Network Restrictions

**Problem:** Some corporate networks block Telegram

**Solution:** Codespaces run in GitHub's cloud, so network restrictions don't apply!

## Prebuilt Agent CLIs

The devcontainer setup includes:
- ✅ Bun (latest)
- ✅ Python 3.14+
- ✅ uv (Python package manager)
- ✅ Takopi (via uv tool install)

To install optional agent CLIs:

### Claude Code
```bash
npm install -g @anthropic-ai/claude-code
```

### Codex (OpenAI)
```bash
npm install -g @openai/codex-cli
```

### OpenCode
```bash
npm install -g opencode-cli
```

### Pi (Inflection AI)
```bash
npm install -g @inflection/pi-cli
```

## Troubleshooting

### "takopi: command not found"

The uv tool install puts binaries in `~/.local/bin`. Add to PATH:

```bash
export PATH="$HOME/.local/bin:$PATH"
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
```

### "Takopi onboarding failed"

Make sure you're running in an interactive terminal, not via `postCreateCommand`. Open a terminal in VS Code and run manually.

### "Telegram messages not sending"

1. Check `~/.takopi/takopi.toml` has valid `bot_token` and `chat_id`
2. Run `bunx takopi-smithers doctor` to test Telegram connection
3. Verify the bot token is active (check @BotFather on Telegram)

### "Smithers workflow won't start"

1. Check logs: `cat .takopi-smithers/logs/supervisor.log`
2. Verify dependencies: `bunx takopi-smithers doctor`
3. Check workflow syntax: `bun --check .smithers/workflow.tsx`

## Cost Considerations

- GitHub Free: 120 core-hours/month for Codespaces
- 2-core machine: ~60 hours of runtime/month
- 4-core machine: ~30 hours of runtime/month

For long-running workflows (24/7), consider:
- Using a self-hosted runner or cloud VM instead
- Or upgrading to GitHub Pro/Enterprise for more core-hours

## Next Steps

- Set up your workflow in `.smithers/workflow.tsx`
- Configure periodic updates in `.takopi-smithers/config.toml`
- Test the auto-heal feature by introducing a deliberate bug
- Monitor via Telegram status updates

For more information, see the main [README.md](../README.md).
