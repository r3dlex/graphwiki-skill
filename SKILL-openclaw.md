name: graphwiki
version: 2.0.0
description: LLM knowledge graph with persistent wiki compilation

context_loading_protocol: |
  When the PreToolUse hook provides insufficient context, follow this manual protocol:
  
  1. Read `graphwiki-out/GRAPH_REPORT.md` (~1-2K tokens) -- project overview
  2. Use `graphwiki path <nodeA> <nodeB>` for structural queries (0 tokens)
  3. Read `wiki/index.md` to find relevant pages (~1-3K tokens)
  4. Read targeted wiki pages (~2-5K each, max 3 pages)
  5. Only read `raw/` files if wiki page is missing, confidence is low, or explicitly requested

commands: |
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

hard_constraints: |
  - **NEVER modify** `raw/` -- immutable source files
  - **NEVER modify** `graphwiki-out/` -- auto-generated output
  - **Maximum 3 wiki pages** per query (token budget)
  - **Protocol order** -- Steps 1-5 required for manual context loading

platforms: [claude, codex, auggie, gemini, cursor, openclaw, copilot, windsurf, cody, codewhisperer, opencode, aider, droid, trae, trae-cn]
