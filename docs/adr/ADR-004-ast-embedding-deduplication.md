---
title: "ADR-004: AST + Embedding Deduplication"
status: accepted
date: 2026-04-10
graph_nodes: ["deduplicator", "onnx-embedding", "cosine-similarity", "context-boost", "merge-result"]
graph_community: 4
sources: ["src/dedup/deduplicator.ts", "src/dedup/deduplicator.test.ts", "src/dedup/embedding.ts", "src/dedup/embedding.test.ts", "src/util/math.ts"]
related: ["ADR-001", "ADR-003"]
confidence: medium
---

**Context**

`Deduplicator` (src/dedup/deduplicator.ts) merges duplicate or near-duplicate `GraphNode` objects using a two-pass strategy: (1) generate `ONNXEmbedding` vectors for all node labels + type suffixes, (2) find candidate pairs via cosine similarity threshold, then apply a context boost using 1-hop neighbor overlap (Jaccard similarity of neighbor sets). Nodes are merged into the survivor with more `provenance` sources. Edges pointing to absorbed nodes are redirected to the survivor; duplicate edges post-redirect are weight-accumulated.

`ONNXEmbedding` (src/dedup/embedding.ts) wraps `onnxruntime-node` with all-MiniLM-L6-v2 (384-dim vectors). Batch processing is applied in chunks of 32 to avoid OOM. Mean pooling over valid tokens produces the final vector, followed by L2 normalization.

`DeduplicationConfig` defaults: `max_candidates=50`, `context_boost_threshold=0.3`, `compatible_types=[class/class, concept/concept, entity/entity]`. Default `merge_threshold` is inherited from the type definition.

**Decision**

1. `ONNXEmbedding.embed` must not return `undefined` for a node — if model inference fails, the entire batch returns `undefined` for those entries; downstream filters skip undefined entries.
2. `_buildCandidates` is capped at `max_candidates` per node and is direction-safe (canonical ordering `min(idA,idB)` first).
3. Context boost may increase effective similarity by at most 20%: `Math.min(1, sim * (1 + 0.2 * (overlap / 0.5)))`.
4. `deduplicate` is deterministic for identical node/edge inputs: merges are sorted by `merged_id` before application.
5. `MergeResult.absorbed_ids` always contains at least one element; `merged_id` is never in `absorbed_ids`.
6. The simplified tokenizer in `_tokenize` produces a maximum sequence of 128 tokens (including [CLS] and [SEP]).

**Consequences**

- Positive: Deduplication reduces graph noise and redundant node count significantly for large codebases.
- Positive: Context boost correctly handles nodes that are near-duplicates in embedding space but have different neighborhoods.
- Negative: The simplified tokenizer (character 3-gram + small vocab) produces lower-quality embeddings than a real BERT tokenizer; this is acceptable for v2 but should be replaced before production at scale.
- Negative: `cosineSimilarity` from `src/util/math.ts` must handle zero vectors (returns 0, not NaN).
