// Graph delta computation for GraphWiki v2
// Computes the difference between two graph versions

import type { GraphDocument, GraphDelta, GraphNode, GraphEdge } from "../types.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname } from "path";

export function computeDelta(
  oldGraph: GraphDocument,
  newGraph: GraphDocument
): GraphDelta {
  const oldNodeMap = new Map(oldGraph.nodes.map((n) => [n.id, n]));
  const newNodeMap = new Map(newGraph.nodes.map((n) => [n.id, n]));

  const oldNodeIds = new Set(oldNodeMap.keys());
  const newNodeIds = new Set(newNodeMap.keys());

  // Added nodes
  const addedNodeIds = [...newNodeIds].filter((id) => !oldNodeIds.has(id));
  const addedNodes = addedNodeIds.map((id) => newNodeMap.get(id)!);

  // Removed nodes
  const removedNodeIds = [...oldNodeIds].filter((id) => !newNodeIds.has(id));
  const removedNodes = removedNodeIds.map((id) => oldNodeMap.get(id)!);

  // Unchanged nodes
  const unchangedIds = [...newNodeIds]
    .filter((id) => oldNodeIds.has(id))
    .filter((id) => {
      const oldNode = oldNodeMap.get(id)!;
      const newNode = newNodeMap.get(id)!;
      return (
        oldNode.label === newNode.label &&
        oldNode.type === newNode.type &&
        JSON.stringify(oldNode.properties) === JSON.stringify(newNode.properties)
      );
    });

  // Modified nodes (changed but not added/removed)
  const modifiedNodeIds = [...newNodeIds]
    .filter((id) => oldNodeIds.has(id) && !unchangedIds.includes(id));
  const modifiedNodes = modifiedNodeIds.map((id) => newNodeMap.get(id)!);

  // Edge diff
  const oldEdgeSet = new Set(oldGraph.edges.map((e) => `${e.source}::${e.target}`));
  const newEdgeSet = new Set(newGraph.edges.map((e) => `${e.source}::${e.target}`));

  const addedEdgeKeys = [...newEdgeSet].filter((k) => !oldEdgeSet.has(k));
  const removedEdgeKeys = [...oldEdgeSet].filter((k) => !newEdgeSet.has(k));

  const addedEdges = addedEdgeKeys
    .map((key) => {
      const [source, target] = key.split("::");
      return newGraph.edges.find((e) => e.source === source && e.target === target);
    })
    .filter(Boolean) as GraphEdge[];

  const removedEdges = removedEdgeKeys
    .map((key) => {
      const [source, target] = key.split("::");
      return oldGraph.edges.find((e) => e.source === source && e.target === target);
    })
    .filter(Boolean) as GraphEdge[];

  const delta: GraphDelta = {
    added: { nodes: addedNodes, edges: addedEdges },
    removed: { nodes: removedNodes, edges: removedEdges },
    modified: modifiedNodes,
    unchanged: unchangedIds,
  };

  return delta;
}

/**
 * Persist a GraphDelta to a timestamped file.
 */
export function persistDelta(delta: GraphDelta, outputDir: string = "graphwiki-out/deltas"): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = `${outputDir}/${timestamp}.delta.json`;

  writeFileSync(filePath, JSON.stringify(delta, null, 2), "utf-8");
}
