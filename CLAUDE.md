# GraphWiki

## What this is

This project uses GraphWiki for persistent knowledge management.
The graph (graphwiki-out/) routes you to the right context.
The wiki (wiki/) contains compiled, human-readable knowledge.
Both stay in sync automatically.

## Context Loading Protocol

Follow this order. Do not skip steps. Do not read raw/ unless Step 5 applies.

Step 1: Read graphwiki-out/GRAPH_REPORT.md (~1-2K tokens)
Step 2: Use graphwiki CLI for structural queries (0 LLM tokens)
        Example: graphwiki path AuthService DatabasePool
Step 3: Read wiki/index.md to find relevant pages (~1-3K tokens)
Step 4: Read targeted wiki pages (~2-5K tokens each, max 3 pages)
Step 5: Read raw/ files ONLY IF:
        - You need to verify a LOW-CONFIDENCE claim
        - The wiki page does not exist for this topic
        - The user explicitly asks you to read the source

## Commands

graphwiki build . --update      # Incremental rebuild after file changes
graphwiki build . --resume      # Resume a crashed/interrupted build
graphwiki build . --permissive  # Allow coerced extraction results
graphwiki query "question"      # Ask a question using tiered loading
graphwiki ingest raw/file.pdf   # Process a new source
graphwiki lint                  # Health check
graphwiki status               # Stats and drift score
graphwiki benchmark "question"  # Measure token usage for this query
graphwiki refine               # Auto-improve extraction prompts
graphwiki refine --review      # Show refinement suggestions without applying
graphwiki refine --rollback     # Revert to previous prompt version

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
