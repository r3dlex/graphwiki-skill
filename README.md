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

## Context Loading Protocol

When working with Claude Code, follow this order:

| Step | Action |
|------|--------|
| 1 | Read `graphwiki-out/GRAPH_REPORT.md` (~1-2K tokens) |
| 2 | Use `graphwiki path <node1> <node2>` for structural queries (0 LLM tokens) |
| 3 | Read `wiki/index.md` to find relevant pages |
| 4 | Read targeted wiki pages (~2-5K each, max 3) |
| 5 | Only read `raw/` files if wiki page missing or low-confidence |

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
