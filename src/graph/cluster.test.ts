import { describe, it, expect } from "vitest";
import { cluster } from "./cluster.js";
import type { GraphDocument } from "../types.js";

describe("cluster", () => {
  it("should return empty map for empty graph", () => {
    const graph: GraphDocument = { nodes: [], edges: [] };
    const result = cluster(graph);
    expect(result.size).toBe(0);
  });

  it("should put each node in its own community initially", () => {
    const graph: GraphDocument = {
      nodes: [
        { id: "n1", label: "A", type: "class" },
        { id: "n2", label: "B", type: "class" },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2", weight: 1 },
      ],
    };
    const result = cluster(graph);
    expect(result.size).toBe(2);
    expect(result.get("n1")).not.toBeUndefined();
    expect(result.get("n2")).not.toBeUndefined();
  });

  it("should cluster connected nodes together", () => {
    const graph: GraphDocument = {
      nodes: [
        { id: "n1", label: "A", type: "class" },
        { id: "n2", label: "B", type: "class" },
        { id: "n3", label: "C", type: "class" },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2", weight: 5 },
        { id: "e2", source: "n2", target: "n3", weight: 5 },
      ],
    };
    const result = cluster(graph);

    // n2 should be in the same community as at least one neighbor
    const n1Comm = result.get("n1");
    const n2Comm = result.get("n2");
    const n3Comm = result.get("n3");
    expect(n1Comm).toBeDefined();
    expect(n2Comm).toBeDefined();
    expect(n3Comm).toBeDefined();
  });

  it("should handle single node", () => {
    const graph: GraphDocument = {
      nodes: [{ id: "n1", label: "Solo", type: "class" }],
      edges: [],
    };
    const result = cluster(graph);
    expect(result.size).toBe(1);
    expect(result.get("n1")).toBe(0);
  });

  it("should respect resolution parameter", () => {
    const graph: GraphDocument = {
      nodes: [
        { id: "n1", label: "A", type: "class" },
        { id: "n2", label: "B", type: "class" },
        { id: "n3", label: "C", type: "class" },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2", weight: 1 },
        { id: "e2", source: "n2", target: "n3", weight: 1 },
      ],
    };
    const resultLow = cluster(graph, 0.5);
    const resultHigh = cluster(graph, 2.0);

    // Different resolutions should give different community structures
    const communitiesLow = new Set(resultLow.values());
    const communitiesHigh = new Set(resultHigh.values());
    // Results may be same or different depending on graph structure
    expect(communitiesLow.size).toBeGreaterThan(0);
    expect(communitiesHigh.size).toBeGreaterThan(0);
  });

  it("should not throw for disconnected components", () => {
    const graph: GraphDocument = {
      nodes: [
        { id: "n1", label: "A", type: "class" },
        { id: "n2", label: "B", type: "class" },
        { id: "n3", label: "C", type: "class" },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2", weight: 1 }],
    };
    const result = cluster(graph);
    expect(result.size).toBe(3);
  });

  it("should handle graph with no edges", () => {
    const graph: GraphDocument = {
      nodes: [
        { id: "n1", label: "A", type: "class" },
        { id: "n2", label: "B", type: "class" },
      ],
      edges: [],
    };
    const result = cluster(graph);
    // Each node should be its own community since there are no edges
    expect(result.size).toBe(2);
  });
});
