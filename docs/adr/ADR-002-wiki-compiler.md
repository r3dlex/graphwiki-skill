---
title: "ADR-002: Wiki Compiler"
status: accepted
date: 2026-04-10
graph_nodes: ["wiki-compiler", "community-summary", "stage-compilation", "frontmatter"]
graph_community: 2
sources: ["src/wiki/compiler.ts", "src/wiki/compiler.test.ts", "src/wiki/types.ts", "src/wiki/index-generator.ts"]
related: ["ADR-001", "ADR-003"]
confidence: high
---

**Context**

`WikiCompiler` (src/wiki/compiler.ts) compiles `GraphDocument` communities into `WikiPage` objects with YAML frontmatter and markdown body. It operates in three stages: (1) `compileStage1` generates section headers and an outline from the full community subgraph; (2) `compileStage2` expands each section with LLM-generated content; (3) `compileStage3` performs deep verification of a single node. The `compileAll` method sorts communities by node count (desc), then god-node count (desc), then dependency order (asc) before batching with `parallel_limit`.

The compiler produces `WikiPage` objects with `path`, `frontmatter` (community, label, type, tags), and `content`. Pages are written to `wiki/` by `WikiCompiler`.

**Decision**

The wiki compiler must produce deterministic output for identical graph inputs:

1. Community sort order is total and deterministic: `(node_count DESC, god_node_count DESC, dependency_order ASC, id ASC)`.
2. Stage 2 sections within a page are ordered by `section_headers` array order (Stage 1 output), not by graph traversal order.
3. The `frontmatter.type` field must be `"community"` for community pages, `"concept"`/`"entity"` for node-level pages.
4. LLM provider calls use fixed `max_tokens` budgets per stage; token counts are recorded in `StageXResult.tokens_used`.
5. If the LLM output contains the word `"incorrect"` (case-insensitive) in Stage 3, `source_verified` is set to `false`.

**Consequences**

- Positive: Compilation is reproducible; CI can compare wiki output before/after graph changes.
- Positive: Token budgets prevent runaway cost in LLM calls.
- Negative: The `"incorrect"` heuristic for `source_verified` is brittle; future versions should use structured JSON output from the LLM.
