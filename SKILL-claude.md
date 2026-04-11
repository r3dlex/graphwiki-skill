---
name: graphwiki
version: 2.0.0
description: LLM knowledge graph with persistent wiki compilation
platforms: [claude, codex, auggie, gemini, cursor, openclaw, copilot, windsurf, cody, codewhisperer, opencode, aider, droid, trae, trae-cn]
---

# GraphWiki Skill

You have access to the GraphWiki knowledge graph for persistent, token-efficient context loading.

## PreToolUse Hook Integration

This skill integrates with Claude Code via the PreToolUse hook (managed by oh-my-claude).

**Hook scripts:** `scripts/graphwiki-pretool.mjs`, `scripts/graphwiki-session-start.mjs`, `scripts/graphwiki-posttool.mjs`
**Hook registration:** `~/.claude/plugins/marketplaces/omc/hooks/hooks.json` (via skill installer)
**Timeout:** 3 seconds
**Hook events:** `PreToolUse`, `SessionStart`, `PostToolUse`

### Hook Behavior

Before every tool use, the PreToolUse hook automatically:

1. Extracts entities from tool input (file paths, CamelCase identifiers, query terms)
2. Routes to the appropriate graph query:
   - **Read / Grep / Glob** -> `graphwiki path <term1> <term2>` (0 LLM tokens)
   - **Ask / Query** -> `graphwiki query "<question>"` (loads wiki pages)
3. Writes context to session state for the agent to consume
4. Tracks token budget (warns at 80% of 150K tokens)
5. Gracefully degrades if graphwiki CLI is unavailable

The hook never blocks tool execution. Tool calls always proceed regardless of hook outcome.

### Event Format

Hook scripts receive snake_case events from OMC (verified from OMC source):
```json
{ "tool_name": "Read", "tool_input": { "file_path": "/src/Auth.ts" }, "cwd": "/project", "session_id": "abc123" }
```

Hook scripts write JSON responses to stdout:
```json
{ "continue": true, "suppressOutput": true }
```

## Context Loading Protocol

When the PreToolUse hook provides insufficient context, follow this manual protocol:

1. Read `graphwiki-out/GRAPH_REPORT.md` (~1-2K tokens) -- project overview
2. Use `graphwiki path <nodeA> <nodeB>` for structural queries (0 tokens)
3. Read `wiki/index.md` to find relevant pages (~1-3K tokens)
4. Read targeted wiki pages (~2-5K each, max 3 pages)
5. Only read `raw/` files if wiki page is missing, confidence is low, or explicitly requested

## Available Commands

| Command | Description |
|---------|-------------|
| `graphwiki build . --update` | Incremental rebuild after file changes |
| `graphwiki build . --resume` | Resume a crashed/interrupted build |
| `graphwiki build . --permissive` | Allow coerced extraction results |
| `graphwiki query "<question>"` | Ask the knowledge base |
| `graphwiki path <nodeA> <nodeB>` | Find shortest path between graph nodes |
| `graphwiki lint` | Health check for contradictions |
| `graphwiki status` | Stats and drift score |
| `graphwiki ingest <file>` | Process a new source file (PDF, code, doc) |
| `graphwiki benchmark "<question>"` | Measure token usage for this query |
| `graphwiki refine` | Auto-improve extraction prompts |
| `graphwiki refine --review` | Show suggestions without applying |
| `graphwiki refine --rollback` | Revert to previous prompts |
| `graphwiki skill install [--platform <name>]` | Install skill for current platform |
| `graphwiki skill generate [--check]` | Generate platform-specific skill files |
| `graphwiki skill uninstall [--platform <name>]` | Remove skill installation |

## Agent Role Matrix

GraphWiki is platform-agnostic. The host tool maps GraphWiki capabilities to its own agent system:

| Role | GraphWiki Integration |
|------|---------------------|
| codebase-search | Use `graphwiki path <term1> <term2>` to find structural relationships before reading files |
| requirements | Use `graphwiki query "<question>"` to load relevant wiki pages before analysis |
| planning | Use `graphwiki status` to check drift and `graphwiki lint` for consistency |
| implementation | Use `graphwiki build . --update` after file changes to keep graph current |
| verification | Use `graphwiki lint` and `graphwiki status` to validate changes |

## Hard Constraints

- **NEVER modify** `raw/` -- immutable source files
- **NEVER modify** `graphwiki-out/` -- auto-generated output
- **Maximum 3 wiki pages** per query (token budget)
- **Protocol order** -- Steps 1-5 required for manual context loading

## Wiki Page Format

Wiki pages have YAML frontmatter:
- `title`, `type`, `graph_nodes`, `graph_community`, `sources`, `related`, `confidence`, `content_hash`

## Platform Installation

- **Claude Code:** `graphwiki skill install --platform claude`
- **Codex:** `graphwiki skill install --platform codex`
- **Auggie:** `graphwiki skill install --platform auggie` (writes to `~/.augment/settings.json`)
- **Gemini:** `graphwiki skill install --platform gemini`
- **Cursor:** `graphwiki skill install --platform cursor`
- **OpenClaw:** `graphwiki skill install --platform openclaw`
- **WindSurf:** Manual: copy `SKILL-windsurf.md` to WindSurf config
- **Cody:** Manual: copy `SKILL-cody.md` to Cody config
- **CodeWhisperer:** Manual: copy `SKILL-codewhisperer.md` to CodeWhisperer config
- **GitHub Copilot:** copy SKILL-copilot.md to `.github/copilot/`

## PreToolUse Hook Integration (for skill installer)

### OMC (Claude Code, Codex)

The skill installer registers these hooks via oh-my-claude's hooks.json:

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

### Auggie

The skill installer registers Auggie hooks via `~/.augment/settings.json`:

```json
"pre_tool_use": [{
  "matcher": "launch-process",
  "hooks": [{
    "type": "command",
    "command": "node \"$GRAPHWIKI_PROJECT_ROOT\"/scripts/graphwiki-auggie-pretool.mjs"
  }]
}]
```

Exit code 2 = blocking; other exit codes non-blocking. Events use snake_case: `tool_name`, `tool_input`, `conversation_id`, `workspace_roots`.

## Generator

`skill-generator.ts` parses this file and generates:
- SKILL-claude.md
- SKILL-codex.md
- SKILL-copilot.md
- SKILL-auggie.md
- SKILL-gemini.md
- SKILL-cursor.md
- SKILL-openclaw.md
- SKILL-windsurf.md
- SKILL-cody.md
- SKILL-codewhisperer.md