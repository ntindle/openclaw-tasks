# Releasing

This document describes how to cut a new release of `@ntindle/openclaw-tasks`.

## Release Methods

### Option 1: GitHub Actions (Recommended)

Trigger a release from GitHub without any local setup:

1. Go to [Actions → Publish to npm](https://github.com/ntindle/openclaw-tasks/actions/workflows/publish.yml)
2. Click "Run workflow"
3. Select version bump type (patch/minor/major)
4. Click "Run workflow"

This automatically:
- Runs tests
- Bumps version
- Publishes to npm with provenance attestation
- Pushes version commit and tag
- Creates GitHub release with auto-generated notes

**Setup required**: Add `NPM_TOKEN` secret in [repo settings](https://github.com/ntindle/openclaw-tasks/settings/secrets/actions)
- Create token at https://www.npmjs.com/settings/ntindle/tokens
- Type: "Granular Access Token" → Automation → read/write packages

### Option 2: Local Release

#### Prerequisites

1. **npm login**: You must be logged into npm as `ntindle`
   ```bash
   npm whoami  # Should return "ntindle"
   npm login   # If not logged in
   ```

2. **gh CLI**: GitHub CLI must be authenticated
   ```bash
   gh auth status
   ```

3. **Clean working tree**: No uncommitted changes
   ```bash
   git status  # Should be clean
   ```

#### Quick Release

For most releases (patch version bump):

```bash
npm run release
```

This single command:
1. Verifies npm login (`npm whoami`)
2. Runs tests (`bun test`)
3. Bumps patch version in package.json
4. Publishes to npm with public access
5. Pushes commits and tags to GitHub
6. Creates a GitHub release with auto-generated notes

## Version Types

| Command | Version Change | When to Use |
|---------|---------------|-------------|
| `npm run release` | 0.1.0 → 0.1.1 | Bug fixes, minor improvements |
| `npm run release:minor` | 0.1.0 → 0.2.0 | New features, backward compatible |
| `npm run release:major` | 0.1.0 → 1.0.0 | Breaking changes |

## Manual Release Steps

If you need more control, here are the individual steps:

```bash
# 1. Ensure you're logged in
npm whoami

# 2. Run tests
bun test

# 3. Bump version (choose one)
npm version patch  # or minor, or major

# 4. Publish to npm
npm publish --access public

# 5. Push to GitHub
git push
git push --tags

# 6. Create GitHub release
gh release create $(git describe --tags --abbrev=0) --generate-notes
```

## npm 2FA / Browser Authentication

When publishing, npm uses browser-based authentication:

1. The script will display a URL like:
   ```
   Authenticate your account at:
   https://www.npmjs.com/auth/cli/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```
2. Open the URL in your browser
3. Complete 2FA if prompted
4. Return to terminal — publish will complete automatically

The release scripts handle this automatically. Just follow the browser prompt when it appears.

## Troubleshooting

### "npm whoami" fails
```bash
npm login
```
Follow the browser authentication flow.

### Tests fail
Fix the tests before releasing. The release scripts intentionally fail fast if tests don't pass.

### Push rejected
```bash
git pull --rebase
npm run release  # Try again
```

### Tag already exists
If you need to re-release the same version (rare):
```bash
git tag -d v0.1.0
git push origin :refs/tags/v0.1.0
npm run release
```

## Post-Release

After a successful release:

1. Verify on npm: https://www.npmjs.com/package/@ntindle/openclaw-tasks
2. Verify on GitHub: https://github.com/ntindle/openclaw-tasks/releases
3. Test installation: `openclaw plugins install @ntindle/openclaw-tasks`
