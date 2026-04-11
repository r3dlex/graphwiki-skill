# NPM Release Pipeline

GraphWiki uses Changesets for automated version bumps and CHANGELOG generation. A CI pipeline on GitHub Actions handles the full release workflow.

## Release Pipeline

```
1. Developer pushes semver tag (e.g., v2.1.0)
       │
       ▼
2. GitHub Actions: tag trigger
       │
       ▼
3. Checkout + pnpm install
       │
       ▼
4. Run tests (pnpm test)
       │
       ▼
5. Build (pnpm run build)
       │
       ▼
6. Generate skills (pnpm run generate:skills)
       │
       ▼
7. Changesets publish (pnpm release)
       │
       ▼
8. NPM package published with:
       - dist/ (compiled TypeScript)
       - SKILL.md (canonical source)
       - SKILL-*.md (generated platform files)
       - scripts/ (hook scripts)
```

## prepublishOnly Script

The `prepublishOnly` script in `package.json` ensures build artifacts are up-to-date before any publish:

```json
{
  "scripts": {
    "prepublishOnly": "pnpm run build && pnpm run generate:skills"
  }
}
```

This runs automatically before:
- `npm publish`
- `pnpm publish`

It is **not** a replacement for the CI build step — CI runs `pnpm run build` explicitly before publish.

## Package Contents

The `files` field in `package.json` controls what is included in the npm package:

```json
{
  "files": [
    "dist",
    "lib",
    "SKILL.md",
    "SKILL-claude.md",
    "SKILL-codex.md",
    "SKILL-copilot.md",
    "SKILL-auggie.md",
    "SKILL-gemini.md",
    "SKILL-cursor.md",
    "SKILL-openclaw.md",
    "SKILL-windsurf.md",
    "SKILL-cody.md",
    "SKILL-codewhisperer.md",
    "scripts"
  ]
}
```

| Path | Purpose |
|------|---------|
| `dist/` | Compiled JavaScript + TypeScript declarations |
| `SKILL.md` | Canonical skill source |
| `SKILL-claude.md` | Claude Code skill file |
| `SKILL-codex.md` | OpenAI Codex skill file |
| `SKILL-copilot.md` | GitHub Copilot skill file |
| `SKILL-gemini.md` | Google Gemini skill file |
| `SKILL-cursor.md` | Cursor skill file (JSON) |
| `SKILL-openclaw.md` | OpenClaw skill file (YAML) |
| `SKILL-auggie.md` | Auggie skill file |
| `SKILL-windsurf.md` | WindSurf skill file |
| `SKILL-cody.md` | Cody skill file |
| `SKILL-codewhisperer.md` | CodeWhisperer skill file |
| `scripts/` | Hook scripts for skill integration |

**Not included:** `src/`, `tests/`, `spec/`, `*.ts` source files.

## Changesets Integration

### Setup

```bash
# Initialize changesets (one-time)
pnpm add -D @changesets/cli
pnpm changeset init
```

### Creating a Release

```bash
# Make changes...
# Add a changeset
pnpm changeset add

# The changeset file describes the bump type:
# ---
# "graphwiki": patch  # bug fix
# "graphwiki": minor  # new feature
# "graphwiki": major  # breaking change
# ---

# Commit the changeset alongside code changes
git commit -m "feat: add new command\n\nCo-Authored-By: Claude <noreply@anthropic.com>"

# Push (CI will handle the rest)
git push
```

### Tag + Publish Flow

```bash
# When ready to release, bump version
pnpm changeset version

# Tag the release
git tag v2.1.0
git push origin v2.1.0

# CI pipeline triggers on tag push:
# 1. checkout
# 2. pnpm install
# 3. pnpm test
# 4. pnpm run build
# 5. pnpm run generate:skills
# 6. pnpm release (publishes to npm)
```

## oh-my-claude Compatibility

The npm package supports `oh-my-claude` skill installation:

```bash
# oh-my-claude detects graphwiki from npm registry
graphwiki skill install --platform claude

# The skill installer:
# 1. Runs npm install graphwiki locally (dev dependency)
# 2. Copies SKILL-claude.md to ~/.claude/skills/
# 3. Registers PreToolUse hooks via hooks.json
```

### oh-my-codex Compatibility

```bash
# Codex uses SKILL-codex.md
graphwiki skill install --platform codex
```

### oh-my-copilot Compatibility

```bash
# Copilot uses SKILL-copilot.md in .github/copilot/
graphwiki skill install --platform copilot
```

## CI Configuration

GitHub Actions workflow (`.github/workflows/ci.yml` — the release job is the `release` job at lines 137-157):

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - run: pnpm run build
      - run: pnpm run generate:skills
      - run: pnpm release
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Version Strategy

- **MAJOR** (`2.0.0`): Breaking API changes, skill format changes
- **MINOR** (`2.1.0`): New commands, new platform support, new hook events
- **PATCH** (`2.1.1`): Bug fixes, documentation updates

## Semantic Version and SKILL.md

When the SKILL.md schema changes (new required sections, frontmatter field changes), a MAJOR version bump is required since platform generators may produce incompatible output.
