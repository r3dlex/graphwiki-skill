# GraphWiki Commands Reference

## Build and Graph Management

| Command | Flags | Description | Output |
|---------|-------|-------------|--------|
| `graphwiki build .` | | Full graph + wiki build from current directory | `graphwiki-out/GRAPH.json`, `wiki/` pages |
| `graphwiki build .` | `--update` | Incremental rebuild (only changed files) | Updated `graphwiki-out/`, `wiki/` |
| `graphwiki build .` | `--resume` | Resume a crashed or interrupted build | Completes previous build state |
| `graphwiki build .` | `--watch` | Watch mode with auto-rebuild on file changes | Watches `raw/` and rebuilds incrementally |
| `graphwiki build .` | `--directed` | Build directed graphs (edges have direction) | Directed graph in `graphwiki-out/` |
| `graphwiki build .` | `--mode deep` | Deep mode extraction (more thorough LLM analysis) | Enhanced graph nodes with deeper context |
| `graphwiki build .` | `--permissive` | Allow coerced extraction results (less strict) | Graph with relaxed validation |

## Query and Navigation

| Command | Flags | Description | Output |
|---------|-------|-------------|--------|
| `graphwiki query "question"` | | Ask the knowledge base a question | Relevant wiki pages, ranked by relevance |
| `graphwiki path <nodeA> <nodeB>` | | Find shortest path between two graph nodes | Path with edges and intermediate nodes |
| `graphwiki add <url>` | | Add a URL source to the graph | Ingests and extracts from remote source |

## Maintenance and Health

| Command | Flags | Description | Output |
|---------|-------|-------------|--------|
| `graphwiki lint` | | Health check for contradictions and inconsistencies | List of issues found, if any |
| `graphwiki status` | | Show stats and drift score | Graph size, node count, drift percentage |
| `graphwiki ingest <file>` | | Ingest a new source file (PDF, code, markdown, doc) | Updated graph with new nodes |
| `graphwiki benchmark "question"` | | Measure token usage for this query | Token counts: prompt, completion, total |

## Prompt Refinement

| Command | Flags | Description | Output |
|---------|-------|-------------|--------|
| `graphwiki refine` | | Auto-improve extraction prompts based on recent extractions | Updated `graphwiki.refine.json` |
| `graphwiki refine` | `--review` | Show suggested prompt improvements without applying | List of suggested changes |
| `graphwiki refine` | `--rollback` | Revert to previous prompt version | Restores previous `graphwiki.refine.json` |

## Hooks and Integration

| Command | Flags | Description | Output |
|---------|-------|-------------|--------|
| `graphwiki hook install` | | Install PreToolUse, SessionStart, PostToolUse hooks | Hooks registered in `~/.claude/plugins/marketplaces/omc/hooks/hooks.json` |
| `graphwiki hook uninstall` | | Uninstall all graphwiki hooks | Hooks removed from hooks.json |
| `graphwiki hook status` | | Check whether hooks are installed | Status message: installed or not |

## Skill Management

| Command | Flags | Description | Output |
|---------|-------|-------------|--------|
| `graphwiki skill install` | `--platform <name>` | Install skill for specified platform (claude, codex, auggie, etc.) | Platform-specific skill files installed |
| `graphwiki skill generate` | `--check` | Generate platform-specific skill files from SKILL.md | Generates SKILL-*.md files, checks for errors |
| `graphwiki skill uninstall` | `--platform <name>` | Remove skill installation for a platform | Platform skill files removed |
| `graphwiki skill uninstall` | `--all` | Remove all skill installations | All SKILL-*.md files removed |
