{
  "name": "graphwiki",
  "version": "2.0.0",
  "description": "LLM knowledge graph with persistent wiki compilation",
  "contextLoadingProtocol": "When the PreToolUse hook provides insufficient context, follow this manual protocol:\n\n1. Read `graphwiki-out/GRAPH_REPORT.md` (~1-2K tokens) -- project overview\n2. Use `graphwiki path <nodeA> <nodeB>` for structural queries (0 tokens)\n3. Read `wiki/index.md` to find relevant pages (~1-3K tokens)\n4. Read targeted wiki pages (~2-5K each, max 3 pages)\n5. Only read `raw/` files if wiki page is missing, confidence is low, or explicitly requested",
  "commands": "| Command | Description |\n|---------|-------------|\n| `graphwiki build . --update` | Incremental rebuild after file changes |\n| `graphwiki build . --resume` | Resume a crashed/interrupted build |\n| `graphwiki build . --permissive` | Allow coerced extraction results |\n| `graphwiki query \"<question>\"` | Ask the knowledge base |\n| `graphwiki path <nodeA> <nodeB>` | Find shortest path between graph nodes |\n| `graphwiki lint` | Health check for contradictions |\n| `graphwiki status` | Stats and drift score |\n| `graphwiki ingest <file>` | Process a new source file (PDF, code, doc) |\n| `graphwiki benchmark \"<question>\"` | Measure token usage for this query |\n| `graphwiki refine` | Auto-improve extraction prompts |\n| `graphwiki refine --review` | Show suggestions without applying |\n| `graphwiki refine --rollback` | Revert to previous prompts |\n| `graphwiki skill install [--platform <name>]` | Install skill for current platform |\n| `graphwiki skill generate [--check]` | Generate platform-specific skill files |\n| `graphwiki skill uninstall [--platform <name>]` | Remove skill installation |",
  "hardConstraints": "- **NEVER modify** `raw/` -- immutable source files\n- **NEVER modify** `graphwiki-out/` -- auto-generated output\n- **Maximum 3 wiki pages** per query (token budget)\n- **Protocol order** -- Steps 1-5 required for manual context loading",
  "platforms": [
    "claude",
    "codex",
    "auggie",
    "gemini",
    "cursor",
    "openclaw",
    "copilot",
    "windsurf",
    "cody",
    "codewhisperer",
    "opencode",
    "aider",
    "droid",
    "trae",
    "trae-cn"
  ]
}