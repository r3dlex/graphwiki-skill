# Skill Architecture

GraphWiki uses a **canonical source pipeline** where `SKILL.md` is the single source of truth, parsed by `skill-generator.ts` to generate all platform-specific skill files.

## Pipeline Overview

```
SKILL.md  →  skill-generator.ts  →  SKILL-claude.md
                                →  SKILL-codex.md
                                →  SKILL-copilot.md
                                →  SKILL-auggie.md
                                →  SKILL-gemini.md
                                →  SKILL-cursor.md
                                →  SKILL-openclaw.md
                                →  SKILL-windsurf.md
                                →  SKILL-cody.md
                                →  SKILL-codewhisperer.md
```

## SKILL.md (Canonical Source)

`SKILL.md` is the source of truth for all platform skill files. It contains:

- **YAML frontmatter** — `name`, `version`, `description`, `platforms[]`
- **Markdown sections** — parsed by `parseSections()` using `#{1,3}` heading detection

Required sections (exact headings):

| Section Heading | Used By |
|----------------|---------|
| Context Loading Protocol | All platforms |
| Available Commands | All platforms |
| Hard Constraints | All platforms |
| PreToolUse Hook Integration | SKILL-claude.md |
| PreToolUse Hook Integration (for skill installer) | Hook registration |
| Platform Installation | SKILL-claude.md |
| Wiki Page Format | SKILL-claude.md |
| Agent Role Matrix | SKILL-claude.md |
| Generator | SKILL-claude.md |

## skill-generator.ts

Located at `src/hooks/skill-generator.ts`. Parses SKILL.md and generates:

1. `parseFrontmatter(content)` — extracts YAML frontmatter (handles `platforms: [a, b]`)
2. `parseSections(body)` — extracts sections by `#{1,3}` heading, skips content inside code blocks
3. Platform-specific generators call `sections.get('Section Name')`

### Key Implementation Details

```typescript
// parseSections skips content inside code blocks to avoid false heading matches
if (line.startsWith('```')) {
  inCodeBlock = !inCodeBlock;
}
if (!inCodeBlock && /^#{1,3}\s+(.+)/.test(line)) {
  // save previous section, start new heading
}
```

## Platform Differences

| Platform | Format | Sections Included |
|----------|--------|-----------------|
| **Claude** | Full markdown with YAML frontmatter | All sections (raw content) |
| **Codex** | Abbreviated markdown | Context Loading Protocol, Available Commands, Hard Constraints |
| **Copilot** | Restructured markdown | How to Use (= Protocol), Commands, Rules (= Constraints) |
| **Auggie** | YAML frontmatter markdown | Context Loading Protocol, Available Commands, Hard Constraints |
| **Gemini** | Plain text (uppercase headers, no markdown) | CONTEXT LOADING PROTOCOL, COMMANDS, HARD CONSTRAINTS |
| **Cursor** | JSON | contextLoadingProtocol, commands, hardConstraints fields |
| **OpenClaw** | YAML | context_loading_protocol, commands, hard_constraints |

### Claude (SKILL-claude.md)
- Output is identical to SKILL.md raw content
- prompt.md compatible (full markdown + YAML frontmatter)
- Used directly by Claude Code as skill documentation

### Codex (SKILL-codex.md)
- Abbreviated to keep within Codex context limits
- Only the 3 essential sections

### Copilot (SKILL-copilot.md)
- Restructured headings: "How to Use", "Commands", "Rules"
- Added brief description paragraph

### Gemini (SKILL-gemini.md)
- All section headings in UPPERCASE
- No markdown formatting (backticks, tables, bold stripped)
- Plain text concatenated sections

### Cursor (SKILL-cursor.md)
- JSON with camelCase field names
- Single top-level object

### OpenClaw (SKILL-openclaw.md)
- YAML with snake_case field names
- Multi-line strings using `|` block scalars

### Auggie (SKILL-auggie.md)
- YAML frontmatter with markdown body
- Same sections as Codex (protocol, commands, constraints)
- Installed to `~/.augment/skills/graphwiki/SKILL.md`

## Hook Integration Model

GraphWiki uses the PreToolUse hook (managed by oh-my-claude) for automatic context enrichment.

### Hook Scripts

- `scripts/graphwiki-pretool.mjs` — PreToolUse hook
- `scripts/graphwiki-session-start.mjs` — SessionStart hook
- `scripts/graphwiki-posttool.mjs` — PostToolUse hook (git commit trigger)

### Hook Registration

The skill installer writes to `~/.claude/plugins/marketplaces/omc/hooks/hooks.json`:

```json
"PreToolUse": [{
  "matcher": "*",
  "hooks": [{
    "type": "command",
    "command": "node \"$GRAPHWIKI_PROJECT_ROOT\"/scripts/graphwiki-pretool.mjs",
    "timeout": 3
  }]
}]
```

### Graceful Degradation

If graphwiki CLI is unavailable, hooks log a warning and return `{ "continue": true }`. Tool execution always proceeds regardless of hook outcome.

## Auggie Skill Installation

GraphWiki integrates with Auggie via `~/.augment/settings.json` hooks and `~/.augment/skills/graphwiki/SKILL.md`.

### Auggie Installation Path

```bash
graphwiki skill install --platform auggie
```

This writes:
- `~/.augment/skills/graphwiki/SKILL.md` — skill definition (generated from SKILL-auggie.md)
- `~/.augment/settings.json` — hook registrations

### Auggie vs OMC Hooks

| Aspect | OMC | Auggie |
|--------|-----|--------|
| Hooks file | `~/.claude/plugins/marketplaces/omc/hooks/hooks.json` | `~/.augment/settings.json` |
| Event field | `session_id` | `conversation_id` |
| PreToolUse blocking | Never (exit code ignored) | Exit code 2 = blocking |

## File Generation Commands

```bash
# Generate all SKILL-*.md files from SKILL.md
pnpm run generate:skills

# Check if generated files match (CI gate)
pnpm run generate:skills --check
```

The `--check` mode compares existing files against regenerated output. CI fails if any file differs, requiring a fresh `generate:skills` run.
