import { describe, it, expect } from "vitest";
import { GraphBuilder } from "./builder.js";
import type { GraphNode, GraphEdge } from "../types.js";

describe("GraphBuilder", () => {
  describe("addNodes", () => {
    it("should add nodes and generate deterministic IDs", () => {
      const builder = new GraphBuilder();
      const nodes: GraphNode[] = [
        { label: "User", type: "class" },
        { label: "Admin", type: "class" },
      ];

      builder.addNodes(nodes);
      const doc = builder.build();

      expect(doc.nodes.length).toBe(2);
      expect(doc.nodes.every((n) => n.id)).toBe(true);
    });

    it("should merge duplicate nodes by ID", () => {
      const builder = new GraphBuilder();
      const node1: GraphNode = {
        id: "same-id",
        label: "Node",
        type: "class",
        provenance: ["file1"],
      };
      const node2: GraphNode = {
        id: "same-id",
        label: "Node",
        type: "class",
        provenance: ["file2"],
      };

      builder.addNodes([node1]);
      builder.addNodes([node2]);
      const doc = builder.build();

      expect(doc.nodes.length).toBe(1);
      expect(doc.nodes[0].provenance).toContain("file1");
      expect(doc.nodes[0].provenance).toContain("file2");
    });

    it("should not overwrite provenance on duplicate add", () => {
      const builder = new GraphBuilder();
      builder.addNodes([
        { id: "id1", label: "X", type: "class", provenance: ["a"] },
      ]);
      builder.addNodes([
        { id: "id1", label: "X", type: "class", provenance: ["b"] },
      ]);
      const doc = builder.build();
      expect(doc.nodes[0].provenance).toContain("a");
      expect(doc.nodes[0].provenance).toContain("b");
    });
  });

  describe("addEdges", () => {
    it("should add edges", () => {
      const builder = new GraphBuilder();
      builder.addNodes([
        { id: "a", label: "A", type: "class" },
        { id: "b", label: "B", type: "class" },
      ]);
      builder.addEdges([{ id: "e1", source: "a", target: "b", weight: 1 }]);
      const doc = builder.build();

      expect(doc.edges.length).toBe(1);
      expect(doc.edges[0].source).toBe("a");
      expect(doc.edges[0].target).toBe("b");
    });

    it("should sum weights of duplicate edges", () => {
      const builder = new GraphBuilder();
      builder.addNodes([
        { id: "a", label: "A", type: "class" },
        { id: "b", label: "B", type: "class" },
      ]);
      builder.addEdges([{ id: "e1", source: "a", target: "b", weight: 1 }]);
      builder.addEdges([{ id: "e2", source: "a", target: "b", weight: 2 }]);
      const doc = builder.build();

      const edge = doc.edges.find((e) => e.source === "a" && e.target === "b");
      expect(edge?.weight).toBe(3);
    });

    it("should accumulate weights regardless of edge ID", () => {
      const builder = new GraphBuilder();
      builder.addNodes([
        { id: "a", label: "A", type: "class" },
        { id: "b", label: "B", type: "class" },
      ]);
      builder.addEdges([{ id: "e1", source: "a", target: "b", weight: 1 }]);
      builder.addEdges([{ id: "eX", source: "a", target: "b", weight: 2 }]);
      const doc = builder.build();

      const weight = doc.edges.reduce((sum, e) => sum + e.weight, 0);
      expect(weight).toBe(3);
    });
  });

  describe("build", () => {
    it("should generate completeness metadata", () => {
      const builder = new GraphBuilder();
      builder.addNodes([
        { id: "n1", label: "A", type: "class", provenance: ["f1"] },
        { id: "n2", label: "B", type: "class" }, // no provenance
      ]);
      const doc = builder.build();

      expect(doc.metadata?.completeness).toBe(0.5);
      expect(doc.metadata?.generated_at).toBeTruthy();
    });

    it("should return empty graph when nothing added", () => {
      const builder = new GraphBuilder();
      const doc = builder.build();

      expect(doc.nodes).toEqual([]);
      expect(doc.edges).toEqual([]);
      expect(doc.metadata?.completeness).toBe(0);
    });

    it("should generate deterministic node IDs from source_file + label", () => {
      const builder = new GraphBuilder();
      builder.addNodes([{ label: "User", type: "class", source_file: "models/user.ts" }]);
      const doc1 = builder.build();

      const builder2 = new GraphBuilder();
      builder2.addNodes([{ label: "User", type: "class", source_file: "models/user.ts" }]);
      const doc2 = builder2.build();

      expect(doc1.nodes[0].id).toBe(doc2.nodes[0].id);
    });
  });
});
