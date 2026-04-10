---
name: graphwiki
version: 2.0.0
description: LLM knowledge graph with persistent wiki compilation
platforms: [claude, codex, gemini, cursor, openclaw, copilot]
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

## Agents

| Agent | Role | Tools | Protocol |
|-------|------|-------|----------|
| oma-explorer | codebase-search | bash, read, glob, grep | Context Loading Protocol |
| oma-analyst | requirements | read, bash | Drift detection, wiki consistency |
| oma-planner | planning | read, bash, write | GraphWiki context for planning |
| oma-executor | implementation | bash, read, edit, glob, write | GraphWiki command execution |
| oma-verifier | verification | bash, read | graphwiki lint, coverage validation |

## Hard Constraints

- **NEVER modify** `raw/` -- immutable source files
- **NEVER modify** `graphwiki-out/` -- auto-generated output
- **Maximum 3 wiki pages** per query (token budget)
- **Protocol order** -- Steps 1-5 required for manual context loading

## Wiki Page Format

Wiki pages have YAML frontmatter:
- `title`, `type`, `graph_nodes`, `graph_community`, `sources`, `related`, `confidence`, `content_hash`

## Platform-Specific Installation

- **Claude Code:** `graphwiki skill install --platform claude`
- **Codex:** `graphwiki skill install --platform codex`
- **Gemini:** `graphwiki skill install --platform gemini`
- **Cursor:** `graphwiki skill install --platform cursor`
- **OpenClaw:** `graphwiki skill install --platform openclaw`
- **GitHub Copilot:** copy SKILL-copilot.md to `.github/copilot/`
- **Auggie:** Research pending -- **excluded from v2**. Auggie's hook API is undocumented and requires separate research before integration.

## Hook Events (for skill installer)

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

## Generator

`skill-generator.ts` parses this file and generates:
- SKILL-claude.md
- SKILL-codex.md
- SKILL-copilot.md
- SKILL-gemini.md
- SKILL-cursor.md
- SKILL-openclaw.md