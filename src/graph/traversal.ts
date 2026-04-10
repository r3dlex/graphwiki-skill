// Graph traversal utilities for GraphWiki v2

import type { GraphDocument, GraphNode, GraphEdge } from "../types.js";

/**
 * Breadth-first search starting from a node.
 */
export function bfs(
  graph: GraphDocument,
  startId: string,
  maxDepth?: number
): GraphNode[] {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const result: GraphNode[] = [];
  const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;

    if (visited.has(id)) continue;
    visited.add(id);

    const node = nodeMap.get(id);
    if (!node) continue;

    result.push(node);

    if (maxDepth !== undefined && depth >= maxDepth) continue;

    // Add neighbors to queue
    for (const edge of graph.edges) {
      if (edge.source === id && !visited.has(edge.target)) {
        queue.push({ id: edge.target, depth: depth + 1 });
      }
      if (edge.target === id && !visited.has(edge.source)) {
        queue.push({ id: edge.source, depth: depth + 1 });
      }
    }
  }

  return result;
}

/**
 * Depth-first search starting from a node.
 */
export function dfs(
  graph: GraphDocument,
  startId: string,
  maxDepth?: number
): GraphNode[] {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const result: GraphNode[] = [];

  function dfsRec(id: string, depth: number): void {
    if (visited.has(id)) return;
    visited.add(id);

    const node = nodeMap.get(id);
    if (!node) return;

    result.push(node);

    if (maxDepth !== undefined && depth >= maxDepth) return;

    for (const edge of graph.edges) {
      if (edge.source === id) {
        dfsRec(edge.target, depth + 1);
      }
      if (edge.target === id) {
        dfsRec(edge.source, depth + 1);
      }
    }
  }

  dfsRec(startId, 0);
  return result;
}

/**
 * Find the shortest path between two nodes using BFS.
 */
export function shortestPath(
  graph: GraphDocument,
  from: string,
  to: string
): string[] {
  if (from === to) return [from];

  const visited = new Set<string>();
  const queue: Array<{ id: string; path: string[] }> = [
    { id: from, path: [from] },
  ];

  while (queue.length > 0) {
    const { id, path } = queue.shift()!;

    if (visited.has(id)) continue;
    visited.add(id);

    for (const edge of graph.edges) {
      if (edge.source === id && !visited.has(edge.target)) {
        const newPath = [...path, edge.target];
        if (edge.target === to) return newPath;
        queue.push({ id: edge.target, path: newPath });
      }
      if (edge.target === id && !visited.has(edge.source)) {
        const newPath = [...path, edge.source];
        if (edge.source === to) return newPath;
        queue.push({ id: edge.source, path: newPath });
      }
    }
  }

  return []; // No path found
}

/**
 * Find "god nodes" — nodes with highest connectivity (degree centrality).
 */
export function godNodes(graph: GraphDocument, topN: number = 10): GraphNode[] {
  const degree = new Map<string, number>();

  for (const node of graph.nodes) {
    degree.set(node.id, 0);
  }

  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + edge.weight);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + edge.weight);
  }

  const sorted = [...degree.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  return sorted.map(([id]) => nodeMap.get(id)!).filter(Boolean);
}

/**
 * Get neighbors of a node up to a given depth.
 */
export function getNeighbors(
  graph: GraphDocument,
  nodeId: string,
  depth: number = 1
): GraphNode[] {
  if (depth <= 0) return [];
  const nodes = bfs(graph, nodeId, depth);
  return nodes.filter((n) => n.id !== nodeId);
}

/**
 * Extract a subgraph containing only the specified nodes and edges between them.
 */
export function getSubgraph(
  graph: GraphDocument,
  nodeIds: string[]
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodeSet = new Set(nodeIds);
  const filteredNodes = graph.nodes.filter((n) => nodeSet.has(n.id));
  const filteredEdges = graph.edges.filter(
    (e) => nodeSet.has(e.source) && nodeSet.has(e.target)
  );
  return { nodes: filteredNodes, edges: filteredEdges };
}
