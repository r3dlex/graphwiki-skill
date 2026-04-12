# GraphWiki Skill Architecture

## Overview

GraphWiki v2 uses a SKILL.md-driven generator architecture. The canonical skill definition (`SKILL.md`) is parsed by `skill-generator.ts` to produce platform-specific skill files.

```
SKILL.md (canonical source)
       |
       v
skill-generator.ts
       |
       +---> SKILL-claude.md
       +---> SKILL-codex.md
       +---> SKILL-copilot.md
       +---> SKILL-auggie.md
       +---> SKILL-gemini.md
       +---> SKILL-cursor.md
       +---> SKILL-openclaw.md
```

## Generated Artifacts

| File | Purpose | Format |
|------|---------|--------|
| `SKILL-claude.md` | Claude Code native skill | YAML frontmatter + markdown |
| `SKILL-codex.md` | Codex skill | Abbreviated markdown |
| `SKILL-copilot.md` | GitHub Copilot | Markdown |
| `SKILL-auggie.md` | Auggie | YAML frontmatter + markdown |
| `SKILL-gemini.md` | Gemini | Plain text sections |
| `SKILL-cursor.md` | Cursor IDE | JSON |
| `SKILL-openclaw.md` | OpenClaw | YAML |
| `scripts/*.mjs` | Hook scripts | ESM modules |
| `hooks.json` entries | Hook registration | JSON |

## Generator Pipeline

1. **SKILL.md** is the canonical source with YAML frontmatter
2. **skill-generator.ts** parses the file and generates platform-specific outputs
3. Generator supports `--check` mode for CI verification
4. All generated files are deterministic and version-controlled

## Hook Lifecycle

```
Agent Tool Call
      |
      v
PreToolUse Hook (graphwiki-pretool.mjs)
      |
      +--> graphwiki path <nodes>  (for Read/Grep/Glob)
      +--> graphwiki query "<q>"   (for Ask/Query)
      |
      v
Session State Updated
      |
      v
Tool Execution Proceeds (hook never blocks)
```

### Hook Events

| Event | Script | Trigger | Purpose |
|-------|--------|---------|---------|
| `PreToolUse` | graphwiki-pretool.mjs | Before every tool | Context loading |
| `SessionStart` | graphwiki-session-start.mjs | Session start | HUD display |
| `PostToolUse` | graphwiki-posttool.mjs | After git commit | Incremental build |

### Event Format (OMC Verified)

Hooks receive snake_case events:
```json
{ "tool_name": "Read", "tool_input": { "file_path": "/src/Auth.ts" }, "cwd": "/project", "session_id": "abc123" }
```

Hooks write JSON responses:
```json
{ "continue": true, "suppressOutput": true }
```

## Token Budget Management

- Budget: 150K tokens
- Warning threshold: 80% (120K tokens)
- Maximum 3 wiki pages per query
- Context loading protocol prioritizes structural queries (0 tokens)

## Platform Compatibility

| Platform | Status | Notes |
|----------|--------|-------|
| Claude Code | Supported | Full PreToolUse integration |
| Codex | Supported | Abbreviated prompt format |
| Gemini | Supported | Plain text sections |
| Cursor | Supported | JSON format |
| OpenClaw | Supported | YAML format |
| GitHub Copilot | Supported | Markdown, manual install |
| Auggie | Supported | Via ~/.augment/settings.json hooks |

## Skill Installer Integration

The skill installer (`skill-installer.ts`) provides:
- `installHook()` - Merges graphwiki entries into `hooks.json`
- `uninstallHook()` - Removes graphwiki entries
- `installAll()` - Calls both installSkill() and installHook()

Hook merge is deep-merge: existing entries are preserved, graphwiki entries are appended.