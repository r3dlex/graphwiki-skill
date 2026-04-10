# GraphWiki

> **LLM knowledge graph with persistent wiki compilation** — TypeScript, TDD 90%+, dual-transport MCP

---

## Features

- **Knowledge Graph** — structures code, docs, and PDFs into an searchable graph
- **Persistent Wiki** — compiled human-readable pages auto-generated from graph
- **Dual-Transport MCP** — stdio + HTTP servers for Claude Code integration
- **Context Loading Protocol** — token-efficient retrieval with tiered loading
- **AST + Embedding Deduplication** — no redundant LLM calls
- **TDD 90%+** — 408 tests across 40 test files

---

## Installation

```bash
npm install graphwiki
```

### Requirements

- `node` >= 18
- `pnpm` >= 9 (or npm/yarn)

### Build from source

```bash
git clone https://github.com/<user>/graphwiki-skill.git
cd graphwiki-skill
pnpm install
pnpm run build
```

---

## Quick Start

```bash
# Build the knowledge graph and wiki from current directory
graphwiki build . --update

# Query the knowledge base
graphwiki query "How does the cache work?"

# Ingest new sources
graphwiki ingest raw/api.pdf

# Health check
graphwiki lint

# Stats and drift score
graphwiki status
```

---

## PreToolUse Hook Integration

GraphWiki integrates with Claude Code via the PreToolUse hook (managed by oh-my-claude).

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

---

## Platform Installation

Install GraphWiki for your platform:

| Platform | Command |
|----------|---------|
| Claude Code | `graphwiki skill install --platform claude` |
| Codex | `graphwiki skill install --platform codex` |
| Gemini | `graphwiki skill install --platform gemini` |
| Cursor | `graphwiki skill install --platform cursor` |
| OpenClaw | `graphwiki skill install --platform openclaw` |
| GitHub Copilot | Copy `SKILL-copilot.md` to `.github/copilot/` |

**Auggie:** Excluded from v2. Auggie's hook API is undocumented and requires separate research before integration.

For full skill documentation, see [SKILL.md](SKILL.md).

---

## Context Loading Protocol

When the PreToolUse hook provides insufficient context, follow this manual protocol:

| Step | Action |
|------|--------|
| 1 | Read `graphwiki-out/GRAPH_REPORT.md` (~1-2K tokens) |
| 2 | Use `graphwiki path <node1> <node2>` for structural queries (0 LLM tokens) |
| 3 | Read `wiki/index.md` to find relevant pages |
| 4 | Read targeted wiki pages (~2-5K each, max 3) |
| 5 | Only read `raw/` files if wiki page missing or low-confidence |

---

## Skill System Architecture

GraphWiki uses a multi-agent skill system with the following agents:

| Agent | Role | Tools | Protocol |
|-------|------|-------|----------|
| oma-explorer | codebase-search | bash, read, glob, grep | Context Loading Protocol |
| oma-analyst | requirements | read, bash | Drift detection, wiki consistency |
| oma-planner | planning | read, bash, write | GraphWiki context for planning |
| oma-executor | implementation | bash, read, edit, glob, write | GraphWiki command execution |
| oma-verifier | verification | bash, read | graphwiki lint, coverage validation |

The skill installer (`graphwiki skill install`) registers PreToolUse hooks via oh-my-claude's hooks.json, enabling automatic context enrichment before each tool call.

For detailed skill configuration and generator, see [SKILL.md](SKILL.md).

---

## Architecture

```
graphwiki-skill/
├── src/
│   ├── benchmark/       # Token measurement and reporting
│   ├── detect/          # Language/directory detection
│   ├── dedup/           # Embedding + AST deduplication
│   ├── extract/         # LLM extraction, caching, batching
│   ├── graph/           # Graph builder, cluster, traversal, drift
│   ├── providers/       # Anthropic, OpenAI, Google AI
│   ├── query/           # Router + cache
│   ├── refine/          # Reviser, ratchet, tracer, diagnostician
│   ├── report/          # Community summary, reporter
│   ├── serve/           # MCP stdio + HTTP servers
│   ├── util/            # Frontmatter, hash, token estimation
│   └── wiki/            # Compiler, index, linter, wiki-graph map
├── graphwiki-out/       # Built knowledge graph
├── wiki/                # Compiled wiki pages
└── raw/                 # Source files (immutable)
```

---

## Commands

| Command | Description |
|---------|-------------|
| `graphwiki build .` | Full graph + wiki build |
| `graphwiki build . --update` | Incremental rebuild |
| `graphwiki build . --resume` | Resume interrupted build |
| `graphwiki query "question"` | Ask the knowledge base |
| `graphwiki ingest <file>` | Ingest new source |
| `graphwiki lint` | Health check |
| `graphwiki status` | Stats and drift score |
| `graphwiki benchmark "question"` | Measure token usage |
| `graphwiki refine` | Auto-improve extraction prompts |
| `graphwiki refine --review` | Show suggestions without applying |
| `graphwiki refine --rollback` | Revert to previous prompts |

---

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm run build

# Type check
pnpm run typecheck

# Lint
pnpm run lint

# Format
pnpm run fmt

# Run all tests
pnpm test

# Unit tests with coverage
pnpm run test:unit

# Watch mode
pnpm run test:watch
```

---

## Test Coverage

| Area | Files |
|------|-------|
| `benchmark/` | baseline-runner, token-counter, report-generator |
| `detect/` | detector |
| `dedup/` | embedding, deduplicator |
| `extract/` | extraction-cache, batch-coordinator, rate-dispatcher, schema-validator, ast-extractor, llm-extractor |
| `graph/` | builder, cluster, drift, traversal, delta |
| `providers/` | provider, anthropic, openai, google |
| `query/` | router, cache |
| `refine/` | tracer, diagnostician, reviser, ratchet, history |
| `report/` | reporter, community-summary |
| `serve/` | mcp-stdio, mcp-http |
| `util/` | hash, frontmatter, token-estimator |
| `wiki/` | compiler, index-generator, wiki-graph-map, linter, updater |

**40 test files — 408 tests — all passing**

---

## License

MIT
