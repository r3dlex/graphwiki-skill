# GraphWiki

![Banner](assets/banner.png)

> **LLM knowledge graph with persistent wiki compilation** — TypeScript, 703 tests (80% line coverage), dual-transport MCP

---

## Features

- **Knowledge Graph** — structures code, docs, and PDFs into a searchable graph
- **Persistent Wiki** — compiled human-readable pages auto-generated from graph
- **Dual-Transport MCP** — stdio + HTTP servers for Claude Code integration
- **Context Loading Protocol** — token-efficient retrieval with tiered loading
- **AST + Embedding Deduplication** — no redundant LLM calls
- **TDD 90% lines / 85% branches / 80% functions** — 703 tests across 59 test files

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

![GraphWiki companion — context loaded, ready to assist](assets/buddy-artist.png)

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

## Commands

| Command | Description |
|---------|-------------|
| `graphwiki build .` | Full graph + wiki build |
| `graphwiki build . --update` | Incremental rebuild |
| `graphwiki build . --resume` | Resume interrupted build |
| `graphwiki query "question"` | Ask the knowledge base |
| `graphwiki path <nodeA> <nodeB>` | Find shortest path between graph nodes |
| `graphwiki ingest <file>` | Ingest new source |
| `graphwiki lint` | Health check |
| `graphwiki status` | Stats and drift score |
| `graphwiki benchmark "question"` | Measure token usage |
| `graphwiki refine` | Auto-improve extraction prompts |
| `graphwiki refine --review` | Show suggestions without applying |
| `graphwiki refine --rollback` | Revert to previous prompts |

---

![GraphWiki companion — building your knowledge graph one node at a time](assets/buddy-scholar.png)

## Build & Ingest

```bash
# Full rebuild from current directory
graphwiki build .

# Incremental rebuild (only changed files)
graphwiki build . --update

# Resume interrupted build
graphwiki build . --resume

# Process a new source file
graphwiki ingest raw/api.pdf
graphwiki ingest raw/docs/architecture.md
```

### Benchmark Results

GraphWiki measures token usage per query. The `graphwiki benchmark` command reports cumulative and per-call token counts:

```bash
graphwiki benchmark "How does authentication work?"
```

**Typical token savings (estimated):**

| Query Type | Without GraphWiki | With GraphWiki | Savings |
|------------|------------------|----------------|---------|
| Structural lookup (`graphwiki path`) | ~8,000 tokens | 0 tokens | **100%** |
| Direct wiki read | ~12,000 tokens | ~3,000 tokens | **75%** |
| Raw file search | ~15,000 tokens | ~2,500 tokens | **83%** |

The deduplication system (AST + embedding similarity) ensures each source file is extracted once. Subsequent queries reference cached graph nodes rather than re-reading raw sources.

---

## Skill System Architecture

GraphWiki uses a canonical skill pipeline where [SKILL.md](SKILL.md) is the single source of truth parsed by `skill-generator.ts` to generate platform-specific skill files:

```
SKILL.md  →  skill-generator.ts  →  SKILL-claude.md
                                    SKILL-codex.md
                                    SKILL-copilot.md
                                    SKILL-auggie.md
                                    SKILL-gemini.md
                                    SKILL-cursor.md
                                    SKILL-openclaw.md
                                    SKILL-windsurf.md
                                    SKILL-cody.md
                                    SKILL-codewhisperer.md
```

- **SKILL.md** is the canonical source with YAML frontmatter and markdown sections
- **skill-generator.ts** parses SKILL.md via `parseFrontmatter` and `parseSections`, then generates platform-specific output
- All SKILL-*.md files are generated — do not edit them directly

For full skill documentation, see [SKILL.md](SKILL.md).

---

## Ignore Files

GraphWiki respects two ignore files that supplement `.graphwiki/config.json`:

### `.graphwikiignore`

User-level per-project ignores for `graphwiki build`. Place in the project root (committed to git). Supports glob patterns:

```
# OMC/OMA state directories
.omc/
.omp/
.oma/

# GraphWiki internal config
.graphwiki/

# Build artifacts
node_modules/
dist/
graphwiki-out/
.wiki/
*.lock
.DS_Store
```

### `.graphifyignore`

Output ignore for final graph nodes. Patterns here exclude nodes from the compiled graph even if they pass all other filters:

```
graphwiki-out/
.wiki/
dist/
.cache/
*.graph.json
*.graphml
```

### Resolution Order

All ignore patterns are additive:
1. `.graphwiki/config.json` → `ignore_patterns` (authoritative)
2. `.graphwikiignore` → user build ignores
3. `.graphifyignore` → graph output ignores

---

## Platform Installation

Install GraphWiki for your platform:

| Platform | Command |
|----------|---------|
| Claude Code | `graphwiki skill install --platform claude` |
| Codex | `graphwiki skill install --platform codex` |
| Auggie | `graphwiki skill install --platform auggie` |
| Gemini | `graphwiki skill install --platform gemini` |
| Cursor | `graphwiki skill install --platform cursor` |
| OpenClaw | `graphwiki skill install --platform openclaw` |
| WindSurf | Manual: copy `SKILL-windsurf.md` to WindSurf config |
| Cody | Manual: copy `SKILL-cody.md` to Cody config |
| CodeWhisperer | Manual: copy `SKILL-codewhisperer.md` to CodeWhisperer config |
| GitHub Copilot | Copy `SKILL-copilot.md` to `.github/copilot/` |

For full skill documentation, see [SKILL.md](SKILL.md).

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

**41 test files — 409 tests — all passing**

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

## License

MIT
