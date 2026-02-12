#!/bin/bash
set -e

echo "🧪 Running full workflow manual test..."
echo ""

# Create temp test directory
TEST_DIR="./test-manual-$(date +%s)"
echo "📁 Creating test directory: $TEST_DIR"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

# Initialize git
echo "🔧 Initializing git repo..."
git init
git config user.email "test@example.com"
git config user.name "Test User"

# Run init
echo ""
echo "📦 Running takopi-smithers init..."
bunx ../dist/cli.js init

# Verify files
echo ""
echo "✅ Verifying created files..."
test -f .takopi-smithers/config.toml || (echo "❌ config.toml missing" && exit 1)
test -f .smithers/workflow.tsx || (echo "❌ workflow.tsx missing" && exit 1)
test -f TAKOPI_SMITHERS.md || (echo "❌ TAKOPI_SMITHERS.md missing" && exit 1)
test -f CLAUDE.md || (echo "❌ CLAUDE.md missing" && exit 1)
test -f AGENTS.md || (echo "❌ AGENTS.md missing" && exit 1)

echo "✅ All files created successfully!"

# Run doctor
echo ""
echo "🩺 Running doctor checks..."
bunx ../dist/cli.js doctor || echo "⚠️  Doctor found issues (expected if Takopi not configured)"

# Cleanup
echo ""
echo "🧹 Cleaning up..."
cd ..
rm -rf "$TEST_DIR"

echo ""
echo "🎉 Manual workflow test completed!"
