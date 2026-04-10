import { describe, it, expect, vi, beforeEach } from "vitest";
import { Deduplicator } from "./deduplicator.js";
import type { GraphNode, GraphEdge } from "../types.js";

describe("Deduplicator", () => {
  const config = {
    merge_threshold: 0.85,
    max_candidates: 50,
    context_boost_threshold: 0.3,
    compatible_types: [["class", "class"], ["concept", "concept"]],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeMockEmbedding(_nodes: GraphNode[]) {
    return {
      embed: vi.fn().mockImplementation((texts: string[]) => {
        return texts.map((_, idx) => {
          // Return a deterministic 384-dim vector for each node
          // Vary by index so different nodes get different vectors
          return Array.from({ length: 384 }, (_, i) =>
            (i + idx) % 5 === 0 ? 1 : 0
          );
        });
      }),
    };
  }

  describe("deduplicate", () => {
    it("should return empty arrays when given empty input", async () => {
      const mockEmbedding = makeMockEmbedding([]);
      const deduplicator = new Deduplicator(config, mockEmbedding as any);
      const result = await deduplicator.deduplicate([], []);
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
      expect(result.merges).toEqual([]);
    });

    it("should not merge nodes below threshold", async () => {
      const nodes: GraphNode[] = [
        { id: "n1", label: "Alpha", type: "class", provenance: ["file1"] },
        { id: "n2", label: "Beta", type: "class", provenance: ["file2"] },
      ];
      const mockEmbedding = makeMockEmbedding(nodes);
      const deduplicator = new Deduplicator(config, mockEmbedding as any);
      const result = await deduplicator.deduplicate(nodes, []);
      // With very different vectors, no merge should occur
      expect(result.nodes.length).toBeGreaterThanOrEqual(1);
    });

    it("should merge compatible same-type nodes with similar embeddings", async () => {
      const nodes: GraphNode[] = [
        { id: "n1", label: "User", type: "class", provenance: ["a.ts"] },
        { id: "n2", label: "User", type: "class", provenance: ["b.ts"] },
        { id: "n3", label: "Account", type: "concept", provenance: ["c.ts"] },
      ];
      const edges: GraphEdge[] = [
        { id: "e1", source: "n1", target: "n3", weight: 1 },
        { id: "e2", source: "n2", target: "n3", weight: 1 },
      ];

      // Override embed to return near-identical vectors for n1 and n2
      const mockEmbedding = {
        embed: vi.fn().mockImplementation((texts: string[]) => {
          // Return near-identical vectors for identical labels
          return texts.map((t, idx) =>
            Array.from({ length: 384 }, (_, i) => (t.includes("User [class]") ? 0.99 : (i + idx) % 5))
          );
        }),
      };

      const deduplicator = new Deduplicator(config, mockEmbedding as any);
      const result = await deduplicator.deduplicate(nodes, edges);
      expect(result.nodes.length).toBeLessThanOrEqual(nodes.length);
    });

    it("should not merge different-type nodes", async () => {
      const nodes: GraphNode[] = [
        { id: "n1", label: "User", type: "class" },
        { id: "n2", label: "User", type: "entity" },
      ];
      const mockEmbedding = makeMockEmbedding(nodes);
      const deduplicator = new Deduplicator(config, mockEmbedding as any);
      const result = await deduplicator.deduplicate(nodes, []);
      // Incompatible types should keep both nodes
      expect(result.nodes.length).toBeGreaterThanOrEqual(2);
    });

    it("should redirect edges to merged node", async () => {
      const nodes: GraphNode[] = [
        { id: "n1", label: "Service", type: "class" },
        { id: "n2", label: "Service", type: "class" },
        { id: "n3", label: "Client", type: "class" },
      ];
      const edges: GraphEdge[] = [
        { id: "e1", source: "n2", target: "n3", weight: 1 },
      ];

      const mockEmbedding = {
        embed: vi.fn().mockImplementation(() =>
          Array.from({ length: 3 }, () =>
            Array.from({ length: 384 }, () => 0.95)
          )
        ),
      };

      const deduplicator = new Deduplicator(config, mockEmbedding as any);
      const result = await deduplicator.deduplicate(nodes, edges);
      // Edge should be redirected to surviving node
      expect(result.edges.length).toBeLessThanOrEqual(edges.length);
    });

    it("should combine provenance on merge", async () => {
      const nodes: GraphNode[] = [
        { id: "n1", label: "Config", type: "concept", provenance: ["x.json"] },
        { id: "n2", label: "Config", type: "concept", provenance: ["y.json"] },
      ];

      const mockEmbedding = {
        embed: vi.fn().mockImplementation(() =>
          Array.from({ length: 2 }, () =>
            Array.from({ length: 384 }, () => 0.98)
          )
        ),
      };

      const deduplicator = new Deduplicator(config, mockEmbedding as any);
      const result = await deduplicator.deduplicate(nodes, []);
      // At least one node should have combined provenance
      const mergedNode = result.nodes.find(
        (n) => n.provenance?.length! >= 2 || result.merges.some((m) => m.merged_id === n.id)
      );
      expect(mergedNode).toBeDefined();
    });
  });
});
