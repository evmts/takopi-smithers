#!/usr/bin/env bash
set -e

echo "📦 Testing takopi-smithers package..."

# Build the package
echo "1. Building package..."
bun run build

# Create test directory
TEST_DIR=$(mktemp -d)
echo "2. Created test directory: $TEST_DIR"

# Initialize git repo (required)
cd "$TEST_DIR"
git init
git config user.email "test@example.com"
git config user.name "Test User"

# Link local package
echo "3. Linking local package..."
cd "$OLDPWD"
bun link
cd "$TEST_DIR"
bun link takopi-smithers

# Test commands
echo "4. Testing --version..."
takopi-smithers --version

echo "5. Testing --help..."
takopi-smithers --help

echo "6. Testing init..."
takopi-smithers init

# Verify files were created
echo "7. Verifying scaffolded files..."
test -f .takopi-smithers/config.toml || (echo "❌ config.toml missing" && exit 1)
test -f .smithers/workflow.tsx || (echo "❌ workflow.tsx missing" && exit 1)
test -f TAKOPI_SMITHERS.md || (echo "❌ TAKOPI_SMITHERS.md missing" && exit 1)
test -f CLAUDE.md || (echo "❌ CLAUDE.md missing" && exit 1)
test -f AGENTS.md || (echo "❌ AGENTS.md missing" && exit 1)

echo "8. Testing doctor..."
takopi-smithers doctor || true  # May fail on CI, that's OK

# Cleanup
cd "$OLDPWD"
rm -rf "$TEST_DIR"

echo "✅ Package test complete!"
