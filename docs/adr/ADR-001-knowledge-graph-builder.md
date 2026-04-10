---
title: "ADR-001: Knowledge Graph Builder"
status: accepted
date: 2026-04-10
graph_nodes: ["graph-builder", "graph-document", "node-id", "edge-accumulation"]
graph_community: 1
sources: ["src/graph/builder.ts", "src/graph/builder.test.ts", "src/types.ts"]
related: ["ADR-002", "ADR-004"]
confidence: high
---

**Context**

`GraphBuilder` (src/graph/builder.ts) is the core abstraction for constructing `GraphDocument` objects from extracted nodes and edges. It must produce deterministic, idempotent, merge-safe output regardless of input ordering. The `addNodes` method uses SHA-256 hashing of `source_file + label` for node ID generation when no explicit ID is provided. The `addEdges` method sums weights for duplicate edges (direction-agnostic). The `build()` method computes a `completeness` ratio from the proportion of nodes with non-empty `provenance`.

**Decision**

`GraphBuilder` is the single source of truth for graph construction. No other module may directly mutate the `nodes` or `edges` arrays of a `GraphDocument`. The following invariants must hold:

1. `addNodes` with identical `{source_file, label}` tuples always produces the same node ID (idempotency).
2. `addEdges` for the same unordered pair always accumulates weight rather than duplicating the edge.
3. `build()` returns a snapshot; subsequent `addNodes`/`addEdges` calls must not mutate the returned object.
4. Nodes must never be silently dropped — any node that passes the type guard is included in the output.
5. The `completeness` metric is computed from `provenance.length > 0`.

**Consequences**

- Positive: Any caller can replay graph construction and get identical output, enabling deterministic builds and caching.
- Negative: SHA-256 node IDs are not human-readable; debugging requires a lookup table.
- Negative: Edge weight accumulation is direction-agnostic, which may lose directionality information for directed graphs (acceptable for undirected knowledge graphs).
