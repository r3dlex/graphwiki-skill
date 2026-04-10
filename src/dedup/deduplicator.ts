// Graph deduplication for GraphWiki v2
// Merges duplicate/similar nodes based on embedding similarity and context

import type {
  GraphNode,
  GraphEdge,
  DeduplicationConfig,
  MergeResult,
} from "../types.js";
import { ONNXEmbedding } from "./embedding.js";
import { cosineSimilarity } from "../util/math.js";

export class Deduplicator {
  private config: DeduplicationConfig;
  private embedding: ONNXEmbedding;

  constructor(config: DeduplicationConfig, embedding: ONNXEmbedding) {
    this.config = {
      max_candidates: 50,
      context_boost_threshold: 0.3,
      compatible_types: [
        ["class", "class"],
        ["concept", "concept"],
        ["entity", "entity"],
      ],
      ...config,
    };
    this.embedding = embedding;
  }

  /**
   * Deduplicate nodes and their edges.
   * Returns the deduplicated graph along with merge records.
   */
  async deduplicate(
    nodes: GraphNode[],
    edges: GraphEdge[]
  ): Promise<{
    nodes: GraphNode[];
    edges: GraphEdge[];
    merges: MergeResult[];
  }> {
    if (nodes.length === 0) {
      return { nodes, edges, merges: [] };
    }

    // Step 1: Generate embeddings for all nodes (label + type suffix)
    const texts = nodes.map((n) => `${n.label} [${n.type}]`);
    const embeddings = await this.embedding.embed(texts);

    // Attach embeddings to nodes (filter out any nodes where embedding failed)
    const nodesWithEmbeddings = nodes
      .map((n, i) => ({ node: n, embedding: embeddings[i] }))
      .filter((item): item is { node: GraphNode; embedding: number[] } => item.embedding !== undefined)
      .map(({ node, embedding }) => ({ ...node, embedding }));

    // Step 2: Build candidate pairs using ANN approximation
    const candidates = this._buildCandidates(nodesWithEmbeddings);

    // Step 3: Score and filter candidates, check context boost
    const merges = this._findMerges(nodesWithEmbeddings, edges, candidates);

    // Step 4: Apply merges (stable sort by node ID for determinism)
    const sortedMerges = [...merges].sort((a, b) =>
      a.merged_id.localeCompare(b.merged_id)
    );
    return this._applyMerges(sortedMerges, nodesWithEmbeddings, edges);
  }

  /**
   * Build candidate pairs using approximate nearest neighbors.
   * Uses vector comparison with max_candidates cap.
   */
  private _buildCandidates(
    nodes: (GraphNode & { embedding: number[] })[]
  ): Array<[string, string, number]> {
    const candidates: Array<[string, string, number]> = [];
    const maxCandidates = this.config.max_candidates ?? 50;

    for (let i = 0; i < nodes.length; i++) {
      const nodeA = nodes[i]!;
      const similarities: Array<{ id: string; sim: number }> = [];

      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const nodeB = nodes[j]!;

        // Type compatibility check
        if (!this._typesCompatible(nodeA.type, nodeB.type)) continue;

        const sim = cosineSimilarity(nodeA.embedding, nodeB.embedding);
        if (sim >= this.config.merge_threshold) {
          similarities.push({ id: nodeB.id, sim });
        }
      }

      // Sort by similarity descending, take top N
      similarities.sort((a, b) => b.sim - a.sim);
      const top = similarities.slice(0, maxCandidates);

      for (const { id, sim } of top) {
        // Deduplicate pairs (only store A < B)
        if (nodeA.id < id) {
          candidates.push([nodeA.id, id, sim]);
        } else {
          candidates.push([id, nodeA.id, sim]);
        }
      }
    }

    // Deduplicate final list
    const seen = new Set<string>();
    return candidates.filter(([a, b]) => {
      const key = `${a}:${b}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Check if two types are compatible for merging.
   */
  private _typesCompatible(typeA: string, typeB: string): boolean {
    const compatible = this.config.compatible_types ?? [];
    return compatible.some(
      ([a, b]) =>
        (typeA === a && typeB === b) || (typeA === b && typeB === a)
    );
  }

  /**
   * Find merges by checking context overlap (1-hop neighbor) and scoring.
   */
  private _findMerges(
    nodes: (GraphNode & { embedding: number[] })[],
    edges: GraphEdge[],
    candidates: Array<[string, string, number]>
  ): MergeResult[] {
    // Build neighbor map
    const neighbors = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (!neighbors.has(edge.source)) neighbors.set(edge.source, new Set());
      if (!neighbors.has(edge.target)) neighbors.set(edge.target, new Set());
      neighbors.get(edge.source)!.add(edge.target);
      neighbors.get(edge.target)!.add(edge.source);
    }

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const merges: MergeResult[] = [];
    const merged = new Set<string>();

    for (const [idA, idB, sim] of candidates) {
      if (merged.has(idA) || merged.has(idB)) continue;

      const nodeA = nodeMap.get(idA)!;
      const nodeB = nodeMap.get(idB)!;
      if (!nodeA || !nodeB) continue;

      // Context boost: check 1-hop neighbor overlap
      let effectiveSim = sim;
      const neighborsA = neighbors.get(idA) ?? new Set();
      const neighborsB = neighbors.get(idB) ?? new Set();

      if (neighborsA.size > 0 && neighborsB.size > 0) {
        const intersection = new Set([...neighborsA].filter((n) => neighborsB.has(n)));
        const union = new Set([...neighborsA, ...neighborsB]);
        const overlap = intersection.size / union.size;

        if (overlap > (this.config.context_boost_threshold ?? 0.3)) {
          // Boost similarity by up to 20% for high context overlap
          effectiveSim = Math.min(1, sim * (1 + 0.2 * (overlap / 0.5)));
        }
      }

      if (effectiveSim < this.config.merge_threshold) continue;

      // Merge into the node with more provenance sources
      const provenanceA = nodeA.provenance?.length ?? 0;
      const provenanceB = nodeB.provenance?.length ?? 0;
      const [mergedId, absorbedId] =
        provenanceA >= provenanceB ? [idA, idB] : [idB, idA];
      const surviving = nodeMap.get(mergedId)!;
      const absorbed = nodeMap.get(absorbedId)!;

      // Combine provenance
      const combinedProvenance = [
        ...new Set([...(surviving.provenance ?? []), ...(absorbed.provenance ?? [])]),
      ];

      // Count edge redirects
      const edgeRedirects = edges.filter(
        (e) => e.source === absorbedId || e.target === absorbedId
      ).length;

      merges.push({
        merged_id: mergedId,
        absorbed_ids: [absorbedId],
        provenance_combined: combinedProvenance,
        edge_redirects: edgeRedirects,
      });

      merged.add(absorbedId);
    }

    return merges;
  }

  /**
   * Apply merges to produce the deduplicated graph.
   * Redirects edges, combines provenance, records merged_from.
   */
  private _applyMerges(
    merges: MergeResult[],
    nodes: (GraphNode & { embedding: number[] })[],
    edges: GraphEdge[]
  ): {
    nodes: GraphNode[];
    edges: GraphEdge[];
    merges: MergeResult[];
  } {
    const absorbedIds = new Set(merges.flatMap((m) => m.absorbed_ids));
    const mergeMap = new Map<string, string>();
    for (const m of merges) {
      for (const abs of m.absorbed_ids) {
        mergeMap.set(abs, m.merged_id);
      }
    }

    // Filter out absorbed nodes
    const deduplicatedNodes = nodes
      .filter((n) => !absorbedIds.has(n.id))
      .map((n) => {
        const merge = merges.find((m) => m.merged_id === n.id);
        if (!merge) return n;

        return {
          ...n,
          provenance: merge.provenance_combined,
          properties: {
            ...n.properties,
            merged_from: merge.absorbed_ids,
          },
        };
      });

    // Redirect edges and recalculate weights
    const deduplicatedEdges = edges
      .filter((e) => !absorbedIds.has(e.source) && !absorbedIds.has(e.target))
      .map((e) => {
        const newSource = mergeMap.get(e.source) ?? e.source;
        const newTarget = mergeMap.get(e.target) ?? e.target;

        if (newSource === e.source && newTarget === e.target) return e;

        return {
          ...e,
          id: `${newSource}->${newTarget}`,
          source: newSource,
          target: newTarget,
        };
      });

    // Recalculate edge weights post-merge (combine duplicate edges)
    const edgeMap = new Map<string, GraphEdge>();
    for (const e of deduplicatedEdges) {
      const key = `${e.source}:${e.target}`;
      if (edgeMap.has(key)) {
        const existing = edgeMap.get(key)!;
        edgeMap.set(key, {
          ...existing,
          weight: existing.weight + e.weight,
        });
      } else {
        edgeMap.set(key, e);
      }
    }

    const finalEdges = Array.from(edgeMap.values());

    return {
      nodes: deduplicatedNodes,
      edges: finalEdges,
      merges,
    };
  }
}
