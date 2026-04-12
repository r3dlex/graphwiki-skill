# Platform-Specific Installation

GraphWiki supports 12 platforms with platform-specific skill files and configuration.

## Quick Install Matrix

| Platform | Command | Config Location | Notes |
|----------|---------|-----------------|-------|
| Claude | `graphwiki skill install --platform claude` | `~/.claude/plugins/marketplaces/omc/` | Automated hook setup |
| Codex | `graphwiki skill install --platform codex` | `~/.codex/settings.json` | OMC hooks support |
| Gemini | `graphwiki skill install --platform gemini` | `~/.gemini/config.json` | Generates SKILL-gemini.md |
| Cursor | `graphwiki skill install --platform cursor` | `~/.cursor/settings.json` | Uses cursor-specific paths |
| OpenClaw | `graphwiki skill install --platform openclaw` | `~/.openclaw/config.json` | Generates SKILL-openclaw.md |
| OpenCode | `graphwiki skill install --platform opencode` | `~/.opencode/config.json` | Generates SKILL-opencode.md |
| Aider | `graphwiki skill install --platform aider` | `~/.aider.conf.json` | Aider integration |
| Droid | `graphwiki skill install --platform droid` | `~/.droid/settings.json` | Generates SKILL-droid.md |
| Trae | `graphwiki skill install --platform trae` | `~/.trae/config.json` | Generates SKILL-trae.md |
| Trae-CN | `graphwiki skill install --platform trae-cn` | `~/.trae-cn/config.json` | CN region variant |
| Auggie | `graphwiki skill install --platform auggie` | `~/.augment/settings.json` | Custom hook format |
| GitHub Copilot | Manual | `.github/copilot-instructions.md` | Copy SKILL-copilot.md |

## Automated Install: Claude / Codex / Auggie

For these platforms, the installer handles all setup:

```bash
cd /path/to/graphwiki-skill
graphwiki skill install --platform claude
# OR
graphwiki skill install --platform codex
# OR
graphwiki skill install --platform auggie
```

The installer will:
1. Copy `SKILL-{platform}.md` to the appropriate location
2. Register hooks (for claude/codex/auggie)
3. Set environment variables (e.g., `GRAPHWIKI_PROJECT_ROOT`)
4. Verify installation with `graphwiki hook status`

## Manual Install: Gemini, Cursor, OpenClaw, etc.

For platforms without automated installers:

### Step 1: Generate Skill Files
```bash
graphwiki skill generate --check
```

This generates:
- `SKILL-gemini.md`
- `SKILL-cursor.md`
- `SKILL-openclaw.md`
- (and others as needed)

### Step 2: Copy to Platform Config

#### Gemini
```bash
cp SKILL-gemini.md ~/.gemini/custom-instructions.md
```

#### Cursor
```bash
cp SKILL-cursor.md ~/.cursor/rules.md
```

#### OpenClaw
```bash
cp SKILL-openclaw.md ~/.openclaw/skills.md
```

#### Aider
```bash
cp SKILL-aider.md ~/.aider/system-prompt.md
```

#### Droid
```bash
cp SKILL-droid.md ~/.droid/skills/graphwiki.md
```

#### Trae / Trae-CN
```bash
cp SKILL-trae.md ~/.trae/skills/graphwiki.md
# For CN:
cp SKILL-trae-cn.md ~/.trae-cn/skills/graphwiki.md
```

## GitHub Copilot

GitHub Copilot uses `.github/copilot-instructions.md` (org-level) or `.github/copilot/` (repo-level).

```bash
mkdir -p .github/copilot
cp SKILL-copilot.md .github/copilot-instructions.md
git add .github/copilot-instructions.md
git commit -m "feat: add GraphWiki skill"
```

## Config.json Format

Most platforms use a `config.json` or similar with this structure:

```json
{
  "skills": [
    {
      "name": "graphwiki",
      "description": "Knowledge graph with persistent wiki compilation",
      "path": "/path/to/SKILL-{platform}.md",
      "enabled": true
    }
  ],
  "hooks": {
    "pre_tool_use": [
      {
        "command": "node $GRAPHWIKI_PROJECT_ROOT/scripts/graphwiki-pretool.mjs",
        "timeout": 3000
      }
    ]
  }
}
```

## Environment Variables

The installer sets these for hook execution:

| Variable | Value | Purpose |
|----------|-------|---------|
| `GRAPHWIKI_PROJECT_ROOT` | Project root path | Resolves hook script paths |
| `GRAPHWIKI_CONFIG` | `.graphwiki/config.json` path | Loads build config |
| `GRAPHWIKI_TOKEN_LIMIT` | `150000` | Hook budget tracking |

## Verifying Installation

```bash
# Check hook status
graphwiki hook status

# Verify hooks are registered
cat ~/.claude/plugins/marketplaces/omc/hooks/hooks.json | grep graphwiki

# Test hook execution
graphwiki build . --update
```

## Uninstalling

```bash
# Remove all skills
graphwiki skill uninstall --all

# Remove specific platform
graphwiki skill uninstall --platform claude

# Remove hooks
graphwiki hook uninstall
```
