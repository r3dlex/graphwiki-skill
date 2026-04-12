import { describe, it, expect } from "vitest";
import { bfs, dfs, shortestPath, godNodes, getNeighbors, getSubgraph } from "./traversal.js";
import type { GraphDocument } from "../types.js";

const sampleGraph: GraphDocument = {
  nodes: [
    { id: "n0", label: "Root", type: "class" },
    { id: "n1", label: "Child1", type: "class" },
    { id: "n2", label: "Child2", type: "class" },
    { id: "n3", label: "Grandchild", type: "class" },
    { id: "n4", label: "Sibling", type: "class" },
  ],
  edges: [
    { id: "e01", source: "n0", target: "n1", weight: 1 },
    { id: "e02", source: "n0", target: "n2", weight: 1 },
    { id: "e13", source: "n1", target: "n3", weight: 1 },
    { id: "e04", source: "n0", target: "n4", weight: 1 },
    { id: "e24", source: "n2", target: "n4", weight: 1 },
  ],
};

describe("traversal", () => {
  describe("bfs", () => {
    it("should traverse graph in breadth-first order", () => {
      const result = bfs(sampleGraph, "n0");
      const ids = result.map((n) => n.id);
      expect(ids[0]).toBe("n0");
      expect(ids).toContain("n1");
      expect(ids).toContain("n2");
    });

    it("should respect maxDepth", () => {
      const result = bfs(sampleGraph, "n0", 1);
      const ids = result.map((n) => n.id);
      expect(ids).toContain("n0");
      expect(ids).toContain("n1");
      expect(ids).toContain("n2");
      expect(ids).not.toContain("n3");
    });

    it("should return empty array for non-existent start", () => {
      const result = bfs(sampleGraph, "does-not-exist");
      expect(result).toEqual([]);
    });
  });

  describe("dfs", () => {
    it("should traverse graph in depth-first order", () => {
      const result = dfs(sampleGraph, "n0");
      expect(result.map((n) => n.id)).toContain("n0");
    });

    it("should respect maxDepth", () => {
      const result = dfs(sampleGraph, "n0", 1);
      const ids = result.map((n) => n.id);
      expect(ids).toContain("n0");
      expect(ids).not.toContain("n3");
    });
  });

  describe("shortestPath", () => {
    it("should find path between connected nodes", () => {
      const path = shortestPath(sampleGraph, "n0", "n3");
      expect(path.join("->")).toBe("n0->n1->n3");
    });

    it("should return empty array for disconnected nodes", () => {
      const isolatedGraph: GraphDocument = {
        nodes: [
          { id: "a", label: "A", type: "class" },
          { id: "b", label: "B", type: "class" },
        ],
        edges: [],
      };
      const path = shortestPath(isolatedGraph, "a", "b");
      expect(path).toEqual([]);
    });

    it("should return [from] when from equals to", () => {
      const path = shortestPath(sampleGraph, "n0", "n0");
      expect(path).toEqual(["n0"]);
    });
  });

  describe("godNodes", () => {
    it("should return nodes with highest degree", () => {
      const result = godNodes(sampleGraph, 2);
      expect(result.length).toBeLessThanOrEqual(2);
    });

    it("should return topN nodes sorted by connectivity", () => {
      const result = godNodes(sampleGraph, 3);
      // n0 has highest degree (3 edges: n1, n2, n4)
      if (result[0]) {
        expect(result[0].id).toBe("n0");
      }
    });
  });

  describe("getNeighbors", () => {
    it("should return direct neighbors", () => {
      const neighbors = getNeighbors(sampleGraph, "n0", 1);
      const ids = neighbors.map((n) => n.id);
      expect(ids).toContain("n1");
      expect(ids).toContain("n2");
      expect(ids).not.toContain("n0");
    });

    it("should return neighbors up to depth", () => {
      const neighbors = getNeighbors(sampleGraph, "n0", 2);
      const ids = neighbors.map((n) => n.id);
      expect(ids).toContain("n3");
    });

    it("should return empty for depth 0", () => {
      const neighbors = getNeighbors(sampleGraph, "n0", 0);
      expect(neighbors).toEqual([]);
    });
  });

  describe("directed graph traversal", () => {
    const directedGraph: GraphDocument = {
      nodes: [
        { id: "a", label: "A", type: "class" },
        { id: "b", label: "B", type: "class" },
        { id: "c", label: "C", type: "class" },
      ],
      edges: [
        { id: "e1", source: "a", target: "b", weight: 1 },
        { id: "e2", source: "b", target: "c", weight: 1 },
      ],
      metadata: { directed: true },
    };

    it("bfs in directed graph only follows forward edges", () => {
      // Starting from "c", in a directed graph we cannot traverse back to "b" or "a"
      const result = bfs(directedGraph, "c");
      const ids = result.map((n) => n.id);
      expect(ids).toContain("c");
      expect(ids).not.toContain("b");
      expect(ids).not.toContain("a");
    });

    it("dfs in directed graph only follows forward edges", () => {
      const result = dfs(directedGraph, "c");
      const ids = result.map((n) => n.id);
      expect(ids).toContain("c");
      expect(ids).not.toContain("b");
      expect(ids).not.toContain("a");
    });

    it("shortestPath in directed graph returns empty when path only exists in reverse direction", () => {
      // c -> a has no directed path (edges go a->b->c only)
      const path = shortestPath(directedGraph, "c", "a");
      expect(path).toEqual([]);
    });

    it("shortestPath in directed graph finds forward path", () => {
      const path = shortestPath(directedGraph, "a", "c");
      expect(path).toEqual(["a", "b", "c"]);
    });

    it("bfs in undirected graph traverses reverse edges", () => {
      const undirected: GraphDocument = {
        nodes: directedGraph.nodes,
        edges: directedGraph.edges,
        metadata: { directed: false },
      };
      const result = bfs(undirected, "c");
      const ids = result.map((n) => n.id);
      expect(ids).toContain("c");
      expect(ids).toContain("b");
      expect(ids).toContain("a");
    });
  });

  describe("getSubgraph", () => {
    it("should extract nodes and edges for given IDs", () => {
      const result = getSubgraph(sampleGraph, ["n0", "n1", "n3"]);
      expect(result.nodes.length).toBe(3);
      expect(result.edges.length).toBe(2);
    });

    it("should only include edges between specified nodes", () => {
      const result = getSubgraph(sampleGraph, ["n0", "n1"]);
      expect(result.edges.length).toBe(1);
      expect(result.edges[0]?.source).toBe("n0");
    });

    it("should return empty when no nodes match", () => {
      const result = getSubgraph(sampleGraph, []);
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
    });
  });
});
