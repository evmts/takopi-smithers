#!/bin/bash
set -e

echo "🚀 Running takopi-smithers post-create setup..."

# Install uv (Python package manager)
echo "📦 Installing uv..."
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

# Install takopi via uv tool
echo "📡 Installing Takopi..."
uv tool install -U takopi

# Optionally install Claude Code CLI globally via npm
# Uncomment if you want Claude Code pre-installed
# echo "🤖 Installing Claude Code CLI..."
# npm install -g @anthropic-ai/claude-code

# Install project dependencies
echo "📚 Installing project dependencies..."
if [ -f "package.json" ]; then
  bun install
fi

# Create placeholder for Takopi config reminder
echo ""
echo "✅ Setup complete!"
echo ""
echo "⚠️  IMPORTANT: Before running 'takopi-smithers start', you need to:"
echo "   1. Configure Takopi: Run 'takopi --onboard' in a terminal with TTY support"
echo "   2. This will create ~/.takopi/takopi.toml with your Telegram bot credentials"
echo "   3. You'll need a Telegram bot token and chat ID"
echo ""
echo "💡 To start developing:"
echo "   - Run 'bunx takopi-smithers init' to scaffold files"
echo "   - Configure Takopi (see above)"
echo "   - Run 'bunx takopi-smithers start' to launch supervisor"
echo ""
