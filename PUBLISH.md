# Publishing takopi-smithers to npm

This guide documents how to publish new versions of takopi-smithers to npm.

## Prerequisites

1. **npm account with publish access**
   - You must be logged into npm: `npm whoami`
   - If not logged in: `npm login`

2. **npm token for GitHub Actions** (for automated publishing)
   - Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   - Click "Generate New Token" → "Automation"
   - Copy the token
   - Add to GitHub repository secrets:
     - Go to https://github.com/williamcory/takopi-smithers/settings/secrets/actions
     - Click "New repository secret"
     - Name: `NPM_TOKEN`
     - Value: (paste your npm token)

## Pre-flight Checks

Before publishing, ensure everything is working:

```bash
# 1. Run all tests (unit + e2e)
bun test src

# 2. Build the package
bun run build

# 3. Test package locally
bun run test:package

# 4. Check what will be published
npm pack --dry-run
```

## Publishing Methods

### Option A: Automated via GitHub Actions (Recommended)

The repository has a GitHub Actions workflow (`.github/workflows/publish.yml`) that automatically publishes when you push a git tag.

**Steps:**

1. Ensure all changes are committed and pushed to main
2. Update version in `package.json` if needed
3. Create and push a git tag:

```bash
# For version 1.0.0
git tag v1.0.0
git push origin v1.0.0
```

4. The workflow will automatically:
   - Run tests
   - Build the package
   - Publish to npm
   - Create a GitHub release

5. Monitor progress at: https://github.com/williamcory/takopi-smithers/actions

### Option B: Manual Publishing

If you need to publish manually:

```bash
# 1. Ensure you're logged in
npm whoami

# 2. Run pre-flight checks
bun test src
bun run build

# 3. Publish
npm publish --access public
```

The `prepublishOnly` hook in package.json will automatically run `bun run build && bun run test:all` before publishing.

## Post-Publication Verification

After publishing (either method), verify:

1. **Check npm registry:**
```bash
open https://www.npmjs.com/package/takopi-smithers
```

2. **Test installation:**
```bash
mkdir /tmp/test-takopi-smithers
cd /tmp/test-takopi-smithers
bunx takopi-smithers@latest --version
# Should print: takopi-smithers 1.0.0
```

3. **Test init command:**
```bash
git init
bunx takopi-smithers@latest init
# Should scaffold all files successfully
```

## Version Numbering

Follow semantic versioning (semver):

- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (0.1.0): New features, backwards compatible
- **PATCH** (0.0.1): Bug fixes, backwards compatible

Update version in `package.json` before tagging.

## Troubleshooting

### "npm ERR! 401 Unauthorized"
- You're not logged into npm
- Run `npm login` and try again

### "npm ERR! 403 Forbidden"
- You don't have publish access to the package
- Contact the package owner

### "You cannot publish over the previously published version"
- The version in package.json already exists on npm
- Increment the version number and try again

### GitHub Actions fails with "NODE_AUTH_TOKEN not found"
- The NPM_TOKEN secret is not configured
- Follow the "Prerequisites" section to add it

## Files Published

The `files` field in package.json controls what gets published:

- `dist/` - Compiled JavaScript and TypeScript definitions
- `examples/` - Example workflows
- `README.md` - Package documentation
- `LICENSE` - MIT license

Source files (`src/`) and tests are NOT published to keep the package size small.

## Package Entry Points

- **Binary:** `takopi-smithers` → `dist/cli.js`
- **ES Module:** `import {} from 'takopi-smithers'` → `dist/index.js`
- **TypeScript types:** `dist/index.d.ts`

## Support

For issues or questions:
- GitHub Issues: https://github.com/williamcory/takopi-smithers/issues
- Documentation: https://github.com/williamcory/takopi-smithers#readme
