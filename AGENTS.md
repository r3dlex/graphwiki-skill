# GraphWiki Agents

This document describes the agent system used in the GraphWiki project.

## What is GraphWiki?

This project uses GraphWiki for persistent knowledge management.
The graph (`graphwiki-out/`) routes you to the right context.
The wiki (`wiki/`) contains compiled, human-readable knowledge.
Both stay in sync automatically.

## Context Loading Protocol

Follow this order. Do not skip steps. Do not read raw/ unless Step 5 applies.

Step 1: Read `graphwiki-out/GRAPH_REPORT.md` (~1-2K tokens)
Step 2: Use `graphwiki CLI` for structural queries (0 LLM tokens)
        Example: `graphwiki path AuthService DatabasePool`
Step 3: Read `wiki/index.md` to find relevant pages (~1-3K tokens)
Step 4: Read targeted wiki pages (~2-5K tokens each, max 3 pages)
Step 5: Read `raw/` files ONLY IF:
        - You need to verify a LOW-CONFIDENCE claim
        - The wiki page does not exist for this topic
        - The user explicitly asks you to read the source

## Commands

graphwiki build . --update      # Incremental rebuild after file changes
graphwiki build . --resume      # Resume a crashed/interrupted build
graphwiki build . --permissive  # Allow coerced extraction results
graphwiki query "question"      # Ask the knowledge base
graphwiki path <nodeA> <nodeB>   # Find shortest path between graph nodes
graphwiki lint                  # Health check for contradictions
graphwiki status               # Stats and drift score
graphwiki ingest <file>         # Process a new source file (PDF, code, doc)
graphwiki benchmark "question"  # Measure token usage for this query
graphwiki refine               # Auto-improve extraction prompts
graphwiki refine --review      # Show suggestions without applying
graphwiki refine --rollback     # Revert to previous prompts
graphwiki skill install [--platform <name>]  # Install skill for current platform
graphwiki skill generate [--check]           # Generate platform-specific skill files
graphwiki skill uninstall [--platform <name>] # Remove skill installation

## Wiki Page Format

Every page in wiki/ has YAML frontmatter:
- title: Page title
- type: concept | entity | source-summary | comparison
- graph_nodes: list of graph node IDs mapped to this page
- graph_community: community ID number
- sources: list of raw/ files referenced
- related: list of [[wiki-links]] to other pages
- confidence: high | medium | low
- content_hash: for diff-based updates

## Rules

1. Always load context through the graph, not by reading files directly.
2. File query results back into wiki/ as new pages when they add knowledge.
3. When you update a wiki page, update its content_hash and updated date.
4. Never modify files in raw/. They are immutable sources.
5. Run graphwiki lint after major changes to catch contradictions.

---

## Agent Role Matrix

| Agent | Role | Tools | Protocol |
|-------|------|-------|----------|
| oma-explorer | codebase-search | bash, read, glob, grep | Context Loading Protocol |
| oma-analyst | requirements | read, bash | Drift detection, wiki consistency |
| oma-planner | planning | read, bash, write | GraphWiki context for planning |
| oma-executor | implementation | bash, read, edit, glob, write | GraphWiki command execution |
| oma-verifier | verification | bash, read | graphwiki lint, coverage validation |
| oma-qa | testing | bash, write, read | Test execution, QA cycling |
| oma-writer | documentation | read, write | Wiki page creation, updates |
| oma-security | security review | bash, read | Vulnerability scanning |
| oma-debugger | debugging | bash, read | Log analysis, issue diagnosis |

## Tool Access Levels

| Tool | Access Level | Notes |
|------|-------------|-------|
| bash | full | All shell commands |
| read | full | All file reading |
| write | full | File creation and editing |
| edit | full | In-place file modifications |
| glob | full | File pattern matching |
| grep | full | Content search |
| TaskCreate | full | Task management |
| TaskUpdate | full | Task status updates |
| TaskGet | full | Task retrieval |
| TaskList | full | Task listing |

## PreToolUse Hook Integration

GraphWiki uses the PreToolUse hook (managed by oh-my-claude) to provide automatic context loading before every tool use.

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

Hook scripts receive snake_case events from OMC:
```json
{ "tool_name": "Read", "tool_input": { "file_path": "/src/Auth.ts" }, "cwd": "/project", "session_id": "abc123" }
```

Hook scripts write JSON responses to stdout:
```json
{ "continue": true, "suppressOutput": true }
```

## Project Conventions

### Test Patterns

- Unit tests in `*.test.ts` files co-located with source
- Integration tests in `tests/integration/`
- Benchmark tests in `tests/benchmark/`
- Use Vitest for test execution

### Coverage Thresholds

- Lines: 90%+
- Branches: 85%+

### File Organization

```
src/
  benchmark/    - Benchmark and performance testing
  cli.ts        - Commander-based CLI
  detect/       - Drift detection
  dedup/        - Deduplication logic
  export/       - Export formats (GraphML, HTML, Neo4j, Obsidian)
  extract/      - LLM extraction and AST extraction
  graph/        - Graph building, clustering, delta detection
  hooks/        - PreToolUse, git-hooks, skill installer
  providers/    - LLM provider integrations (Anthropic, OpenAI, Google)
  query/        - Query routing and caching
  refine/       - Prompt refinement system
  report/       - Community summary and reporting
  serve/        - MCP server (HTTP and stdio)
  types.ts      - Shared type definitions
  util/         - Utilities (frontmatter, hash, math, token estimation)
  wiki/         - Wiki compilation and linting

scripts/
  graphwiki-pretool.mjs        - PreToolUse hook
  graphwiki-session-start.mjs  - SessionStart hook
  graphwiki-posttool.mjs        - PostToolUse hook (git commit trigger)

graphwiki-out/   - Auto-generated graph output
wiki/            - Compiled wiki pages
raw/             - Immutable source files (NEVER modify)
```

## Hard Constraints

- **NEVER modify** `raw/` -- immutable source files
- **NEVER modify** `graphwiki-out/` -- auto-generated output
- **Maximum 3 wiki pages** per query (token budget)
- **Protocol order** -- Steps 1-5 required for manual context loading

## Platform Support

- **Claude Code:** `graphwiki skill install --platform claude`
- **Codex:** `graphwiki skill install --platform codex`
- **Gemini:** `graphwiki skill install --platform gemini`
- **Cursor:** `graphwiki skill install --platform cursor`
- **OpenClaw:** `graphwiki skill install --platform openclaw`
- **GitHub Copilot:** copy SKILL-copilot.md to `.github/copilot/`
- **Auggie:** Research pending -- **excluded from v2**. Auggie's hook API is undocumented and requires separate research before integration.