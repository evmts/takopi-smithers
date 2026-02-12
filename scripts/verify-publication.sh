#!/usr/bin/env bash
# Post-publication verification script for takopi-smithers v1.0.0

set -e

echo "🔍 Verifying takopi-smithers v1.0.0 publication..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track failures
FAILED=0

# Check 1: npm registry version
echo "📦 Checking npm registry..."
PUBLISHED_VERSION=$(npm view takopi-smithers version 2>/dev/null || echo "NOT_FOUND")

if [ "$PUBLISHED_VERSION" = "1.0.0" ]; then
    echo -e "${GREEN}✅ Package published: takopi-smithers@1.0.0${NC}"
elif [ "$PUBLISHED_VERSION" = "NOT_FOUND" ]; then
    echo -e "${RED}❌ Package not found on npm registry${NC}"
    FAILED=1
else
    echo -e "${YELLOW}⚠️  Package found but version is $PUBLISHED_VERSION (expected 1.0.0)${NC}"
    FAILED=1
fi
echo ""

# Check 2: Test installation in clean directory
echo "🧪 Testing installation in clean directory..."
TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"
git init --quiet 2>/dev/null || true

if bunx takopi-smithers@latest --version 2>&1 | grep -q "1.0.0"; then
    echo -e "${GREEN}✅ Version command works: $(bunx takopi-smithers@latest --version 2>&1 | head -n1)${NC}"
else
    echo -e "${RED}❌ Version command failed or returned wrong version${NC}"
    FAILED=1
fi
echo ""

# Check 3: Test init command
echo "🏗️  Testing init command..."
if bunx takopi-smithers@latest init 2>&1 | grep -q "Initialization complete"; then
    echo -e "${GREEN}✅ Init command scaffolds files successfully${NC}"

    # Verify key files were created
    if [ -f ".takopi-smithers/config.toml" ] && [ -f ".smithers/workflow.tsx" ]; then
        echo -e "${GREEN}✅ Required files created${NC}"
    else
        echo -e "${RED}❌ Some required files missing${NC}"
        FAILED=1
    fi
else
    echo -e "${RED}❌ Init command failed${NC}"
    FAILED=1
fi
echo ""

# Cleanup
cd - > /dev/null
rm -rf "$TEST_DIR"

# Check 4: Package metadata
echo "📋 Checking package metadata..."
if npm view takopi-smithers description 2>&1 | grep -q "AI-supervised workflow automation"; then
    echo -e "${GREEN}✅ Package description correct${NC}"
else
    echo -e "${YELLOW}⚠️  Package description might be incorrect${NC}"
fi

if npm view takopi-smithers keywords 2>&1 | grep -q "smithers"; then
    echo -e "${GREEN}✅ Package keywords set${NC}"
else
    echo -e "${YELLOW}⚠️  Package keywords might be missing${NC}"
fi

if npm view takopi-smithers bin 2>&1 | grep -q "takopi-smithers"; then
    echo -e "${GREEN}✅ Binary entry point configured${NC}"
else
    echo -e "${RED}❌ Binary entry point missing${NC}"
    FAILED=1
fi
echo ""

# Check 5: Package links
echo "🔗 Package URLs:"
echo "   npm: https://www.npmjs.com/package/takopi-smithers"
echo "   GitHub: $(npm view takopi-smithers repository.url 2>/dev/null || echo 'Not found')"
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All verification checks passed!${NC}"
    echo ""
    echo "takopi-smithers v1.0.0 is successfully published and functional."
    echo ""
    echo "Next steps:"
    echo "  • Update README.md with npm badge"
    echo "  • Create GitHub release notes"
    echo "  • Announce the release"
    exit 0
else
    echo -e "${RED}❌ Some verification checks failed${NC}"
    echo ""
    echo "Please review the errors above and:"
    echo "  • Ensure package was published successfully"
    echo "  • Check npm registry: npm view takopi-smithers"
    echo "  • Try manual installation: npm install -g takopi-smithers@latest"
    exit 1
fi
