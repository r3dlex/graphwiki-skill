// Leiden community detection for GraphWiki v2
// Implements Louvain/Leiden modularity optimization

import type { GraphDocument, GraphNode, GraphEdge } from "../types.js";

export function cluster(
  graph: GraphDocument,
  resolution: number = 1.0
): Map<string, number> {
  const nodes = graph.nodes;
  const edges = graph.edges;

  if (nodes.length === 0) return new Map();

  // Initialize: each node in its own community
  const community: Map<string, number> = new Map();
  const nodeIds = nodes.map((n) => n.id);
  nodeIds.forEach((id, i) => community.set(id, i));

  // Build adjacency lists
  const neighbors = new Map<string, Array<{ neighbor: string; weight: number }>>();
  for (const node of nodes) {
    neighbors.set(node.id, []);
  }
  for (const edge of edges) {
    neighbors.get(edge.source)?.push({ neighbor: edge.target, weight: edge.weight });
    neighbors.get(edge.target)?.push({ neighbor: edge.source, weight: edge.weight });
  }

  // Total edge weight
  const m = edges.reduce((sum, e) => sum + e.weight, 0);
  if (m === 0) return community;

  // Node weights (sum of incident edge weights)
  const k = new Map<string, number>();
  for (const node of nodes) {
    const nodeEdges = edges.filter(
      (e) => e.source === node.id || e.target === node.id
    );
    k.set(node.id, nodeEdges.reduce((sum, e) => sum + e.weight, 0));
  }

  // Leiden refinement
  const refinedCommunity = leidenRefinement(
    community,
    neighbors,
    k,
    m,
    resolution
  );

  return refinedCommunity;
}

/**
 * Leiden algorithm: contracts communities and re-refines.
 */
function leidenRefinement(
  community: Map<string, number>,
  neighbors: Map<string, Array<{ neighbor: string; weight: number }>>,
  k: Map<string, number>,
  m: number,
  resolution: number
): Map<string, number> {
  const nodeIds = Array.from(community.keys());
  let improved = true;
  let iteration = 0;
  const maxIterations = 100;

  while (improved && iteration < maxIterations) {
    improved = false;
    iteration++;

    // Greedy modularity optimization: move nodes between communities
    for (const nodeId of nodeIds) {
      const currentCommunity = community.get(nodeId)!;
      const nodeNeighbors = neighbors.get(nodeId) ?? [];

      // Compute modularity gain for moving to each neighbor's community
      let bestCommunity = currentCommunity;
      let bestGain = 0;

      const neighborCommunities = new Set(
        nodeNeighbors.map(({ neighbor }) => community.get(neighbor)!)
      );

      for (const targetComm of neighborCommunities) {
        if (targetComm === currentCommunity) continue;

        const gain = computeModularityGain(
          nodeId,
          currentCommunity,
          targetComm,
          nodeNeighbors,
          community,
          k,
          m,
          resolution
        );

        if (gain > bestGain) {
          bestGain = gain;
          bestCommunity = targetComm;
        }
      }

      if (bestCommunity !== currentCommunity && bestGain > 0) {
        community.set(nodeId, bestCommunity);
        improved = true;
      }
    }
  }

  // Leiden contraction phase: re-assign community IDs to be contiguous
  const uniqueCommunities = [...new Set(community.values())];
  const communityMap = new Map<number, number>();
  uniqueCommunities.forEach((c, i) => communityMap.set(c, i));
  for (const [nodeId, comm] of community) {
    community.set(nodeId, communityMap.get(comm)!);
  }

  return community;
}

/**
 * Compute modularity gain for moving a node from one community to another.
 * Q = sum_ij [A_ij - (k_i * k_j) / (2m)] * delta(C_i, C_j)
 * Simplified gain calculation:
 * gain = sum_in/to_same - sum_out/from_diff
 */
function computeModularityGain(
  nodeId: string,
  fromCommunity: number,
  toCommunity: number,
  nodeNeighbors: Array<{ neighbor: string; weight: number }>,
  community: Map<string, number>,
  k: Map<string, number>,
  m: number,
  resolution: number
): number {
  const k_i = k.get(nodeId) ?? 0;
  if (k_i === 0) return 0;

  let sumToTarget = 0;
  let sumFromSource = 0;

  for (const { neighbor, weight } of nodeNeighbors) {
    const neighborComm = community.get(neighbor)!;
    if (neighborComm === toCommunity) {
      sumToTarget += weight;
    }
    if (neighborComm === fromCommunity) {
      sumFromSource += weight;
    }
  }

  // Modularity gain formula with resolution parameter
  const totalWeight = m * 2;
  const gain =
    (sumToTarget - sumFromSource) / totalWeight -
    (resolution * k_i * k_i) / (totalWeight * totalWeight);

  return gain;
}
