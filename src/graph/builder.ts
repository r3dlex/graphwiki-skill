// Graph builder for GraphWiki v2
// Constructs a GraphDocument from nodes and edges with deterministic IDs

import type { GraphNode, GraphEdge, GraphDocument } from "../types.js";
import { createHash } from "crypto";

export class GraphBuilder {
  private nodes: Record<string, GraphNode> = {};
  private edgeList: GraphEdge[] = [];
  private edgeSet = new Set<string>();

  constructor() {}

  /**
   * Add nodes to the graph.
   * Node IDs are deterministically computed as hash(source_file + label).
   * Duplicate nodes (same ID) are merged.
   */
  addNodes(nodes: GraphNode[]): void {
    for (const node of nodes) {
      const id = node.id ?? this._computeNodeId(node);
      const existing = this.nodes[id];

      if (existing) {
        // Merge: combine provenance, union properties
        this.nodes[id] = {
          ...existing,
          ...node,
          id,
          provenance: [
            ...new Set([...(existing.provenance ?? []), ...(node.provenance ?? [])]),
          ],
          properties: {
            ...existing.properties,
            ...node.properties,
          },
        };
      } else {
        this.nodes[id] = { ...node, id };
      }
    }
  }

  /**
   * Add edges to the graph.
   * Duplicate edges (same source+target) have their weights summed.
   */
  addEdges(edges: GraphEdge[]): void {
    for (const edge of edges) {
      const key = `${edge.source}:${edge.target}`;
      const reverseKey = `${edge.target}:${edge.source}`;

      if (this.edgeSet.has(key) || this.edgeSet.has(reverseKey)) {
        // Accumulate weight for duplicate edge
        const existing = this.edgeList.find(
          (e) =>
            (e.source === edge.source && e.target === edge.target) ||
            (e.source === edge.target && e.target === edge.source)
        );
        if (existing) {
          existing.weight += edge.weight;
          existing.provenance = [
            ...new Set([...(existing.provenance ?? []), ...(edge.provenance ?? [])]),
          ];
        }
      } else {
        this.edgeSet.add(key);
        this.edgeList.push({ ...edge });
      }
    }
  }

  /**
   * Build and return the complete GraphDocument.
   */
  build(): GraphDocument {
    const nodeArray = Object.values(this.nodes);
    const edgeArray = [...this.edgeList];

    // Compute completeness metadata
    const nodesWithProvenance = nodeArray.filter((n) => (n.provenance?.length ?? 0) > 0).length;
    const completeness = nodeArray.length > 0
      ? nodesWithProvenance / nodeArray.length
      : 0;

    return {
      nodes: nodeArray,
      edges: edgeArray,
      metadata: {
        completeness,
        generated_at: new Date().toISOString(),
      },
    };
  }

  /**
   * Compute a deterministic node ID from source_file + label.
   */
  private _computeNodeId(node: GraphNode): string {
    const source = node.source_file ?? "";
    const label = node.label ?? "";
    const combined = `${source}::${label}`;
    return createHash("sha256").update(combined).digest("hex").slice(0, 16);
  }
}
