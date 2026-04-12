---
name: graphwiki
version: 2.0.0
description: LLM knowledge graph with persistent wiki compilation
platforms: [claude, codex, auggie, gemini, cursor, openclaw, copilot, windsurf, cody, codewhisperer, opencode, aider, droid, trae, trae-cn]
---

# GraphWiki Skill

You have access to the GraphWiki knowledge graph for persistent, token-efficient context loading.

## Process Overview

1. **Automatic Context Loading** — PreToolUse hook injects graph context before every tool use
2. **Tiered Protocol** — Manual protocol: graph overview → paths → wiki index → wiki pages → raw files
3. **Token Tracking** — Hook tracks spend vs. 150K session budget (warns at 80%)
4. **Zero-Cost Lookup** — `graphwiki path` structural queries use 0 LLM tokens

## Quick Start

```bash
graphwiki build . --update          # Rebuild graph incrementally
graphwiki query "your question"     # Ask the knowledge base
graphwiki path Node1 Node2          # Find structural path (0 tokens)
graphwiki hook install              # Install PreToolUse hook
```

## Hard Constraints

- **NEVER modify** `raw/` — immutable source files
- **NEVER modify** `graphwiki-out/` — auto-generated output
- **Max 3 wiki pages** per query (token budget)
- **Protocol order** — Always follow Steps 1-5 in context loading

## Key References

For complete documentation, see:
- **[references/commands.md](references/commands.md)** — Full command table with flags and examples
- **[references/context-protocol.md](references/context-protocol.md)** — Manual context loading steps (when hook insufficient)
- **[references/hook-integration.md](references/hook-integration.md)** — Hook scripts, event format, registration details
- **[references/platform-install.md](references/platform-install.md)** — Platform-specific installation and config

## Agent Role Matrix

| Role | GraphWiki Integration |
|------|---------------------|
| codebase-search | Use `graphwiki path <term1> <term2>` (0 tokens) |
| requirements | Use `graphwiki query` to load wiki pages |
| planning | Use `graphwiki status` and `graphwiki lint` |
| implementation | Use `graphwiki build . --update` on file changes |
| verification | Use `graphwiki lint` and `graphwiki status` |

## Generator

`skill-generator.ts` parses this file and generates platform-specific skills:
SKILL-claude.md, SKILL-codex.md, SKILL-copilot.md, SKILL-auggie.md, SKILL-gemini.md, SKILL-cursor.md, SKILL-openclaw.md, SKILL-windsurf.md, SKILL-cody.md, SKILL-codewhisperer.md, and others.