// Math utilities for GraphWiki v2

/**
 * Compute cosine similarity between two vectors.
 * Both vectors must have the same dimension.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dotProduct += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Compute the Euclidean distance between two vectors.
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i]! - b[i]!;
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Compute the Manhattan (L1) distance between two vectors.
 */
export function manhattanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.abs(a[i]! - b[i]!);
  }
  return sum;
}

/**
 * Compute the modularity gain for moving a node from one community to another.
 * Modularity Q = sum_over_communities (e_ii / m - (k_i / 2m)^2)
 * where e_ii = edges within community i, k_i = sum of weights of edges incident to i, m = total edge weight.
 */
export function modularityGain(
  nodeId: string,
  fromCommunity: number,
  toCommunity: number,
  edges: { source: string; target: string; weight: number }[],
  communityMembership: Map<string, number>,
  totalWeight: number
): number {
  if (fromCommunity === toCommunity) return 0;

  const k_i = edges
    .filter((e) => e.source === nodeId || e.target === nodeId)
    .reduce((sum, e) => sum + e.weight, 0);

  // Sigma_i_in: total weight of edges from node to nodes in target community
  const sigma_i_in = edges
    .filter((e) => {
      const other = e.source === nodeId ? e.target : e.source;
      return communityMembership.get(other) === toCommunity;
    })
    .reduce((sum, e) => sum + e.weight, 0);

  // Fraction of total edge weight
  const m = totalWeight / 2;

  // Modularity gain approximation
  const gain = (sigma_i_in - k_i * k_i) / (4 * m * m);
  return gain;
}
