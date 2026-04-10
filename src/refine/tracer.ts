// Backward tracer for GraphWiki v2
// Traces query failures to identify root causes

import type { GraphDocument, GraphNode, TraceResult, QueryResult } from '../types.js';

/**
 * Backward tracer for diagnosing query failures
 *
 * Forward path: wiki pages loaded -> graph nodes traversed -> tier reached -> tokens consumed
 * Backward path: weak nodes -> extraction cache entries -> extraction prompt version
 */
export class Tracer {
  private extractionCache: Map<string, { version: string; timestamp: number }>;
  private promptVersion: string;

  constructor(promptVersion = 'v1') {
    this.extractionCache = new Map();
    this.promptVersion = promptVersion;
  }

  /**
   * Trace a query failure to identify root causes
   */
  traceQueryFailure(
    query: string,
    result: QueryResult,
    graph: GraphDocument
  ): TraceResult {
    const forwardPath = this.traceForwardPath(query, result);
    const backwardPath = this.traceBackwardPath(result, graph);
    const rootCauses = this.identifyRootCauses(forwardPath, backwardPath);

    return {
      query,
      forwardPath,
      backwardPath,
      rootCauses,
    };
  }

  /**
   * Trace forward: what was accessed during the query
   */
  private traceForwardPath(query: string, result: QueryResult) {
    // Wiki pages that were loaded
    const wikiPagesLoaded = this.extractWikiPages(result);

    // Graph nodes that were traversed
    const graphNodesTraversed = this.extractGraphNodes(result);

    // Highest tier reached
    const tierReached = this.extractTier(result);

    // Tokens consumed
    const tokensConsumed = result.tokens_used ?? 0;

    return {
      wikiPagesLoaded,
      graphNodesTraversed,
      tierReached,
      tokensConsumed,
    };
  }

  /**
   * Trace backward: find weak points in the chain
   */
  private traceBackwardPath(result: QueryResult, graph: GraphDocument) {
    // Find nodes that may have contributed to the failure
    const weakNodes = this.findWeakNodes(result, graph);

    // Find relevant cache entries
    const extractionCacheEntries = this.findCacheEntries(result);

    // Get extraction prompt version
    const extractionPromptVersion = this.promptVersion;

    return {
      weakNodes,
      extractionCacheEntries,
      extractionPromptVersion,
    };
  }

  /**
   * Identify root causes from forward and backward paths
   */
  private identifyRootCauses(
    forward: TraceResult['forwardPath'],
    backward: TraceResult['backwardPath']
  ): string[] {
    const causes: string[] = [];

    // Check if tier was insufficient
    if (forward.tierReached < 3) {
      causes.push('INSUFFICIENT_TIER: Query reached only tier ' + forward.tierReached + ', may need deeper context');
    }

    // Check for weak nodes in the path
    if (backward.weakNodes.length > 0) {
      causes.push('WEAK_NODES: ' + backward.weakNodes.length + ' nodes with low confidence in path');
    }

    // Check for cache misses
    const cacheMissRatio = this.calculateCacheMissRatio(forward, backward);
    if (cacheMissRatio > 0.5) {
      causes.push('CACHE_MISSES: High cache miss ratio (' + (cacheMissRatio * 100).toFixed(0) + '%)');
    }

    // Check for high token consumption
    if (forward.tokensConsumed > 50000) {
      causes.push('TOKEN_BLOAT: Excessive token consumption (' + forward.tokensConsumed + ')');
    }

    // Check for missing context (few wiki pages loaded)
    if (forward.wikiPagesLoaded.length < 3) {
      causes.push('SPARSE_CONTEXT: Few wiki pages loaded (' + forward.wikiPagesLoaded.length + ')');
    }

    // Check prompt version
    if (backward.extractionPromptVersion === 'v1') {
      causes.push('OUTDATED_PROMPTS: Using prompt version v1, consider upgrading');
    }

    return causes;
  }

  /**
   * Extract wiki pages from query result
   */
  private extractWikiPages(result: QueryResult): string[] {
    // In a real implementation, this would extract from the actual result
    // For now, we return a placeholder based on context
    if (result.context && Array.isArray(result.context)) {
      return result.context.map(c => c.source ?? 'unknown').slice(0, 10);
    }
    return [];
  }

  /**
   * Extract graph nodes from query result
   */
  private extractGraphNodes(result: QueryResult): string[] {
    if (result.nodes && Array.isArray(result.nodes)) {
      return result.nodes.map(n => n.id ?? 'unknown');
    }
    return [];
  }

  /**
   * Extract tier reached from query result
   */
  private extractTier(result: QueryResult): number {
    return result.tier ?? 1;
  }

  /**
   * Find weak nodes (low confidence or missing properties)
   */
  private findWeakNodes(result: QueryResult, graph: GraphDocument): string[] {
    const weakNodes: string[] = [];

    // Find nodes in the result that have issues
    if (result.nodes) {
      for (const node of result.nodes) {
        // Check confidence (if the result has confidence scores)
        const confidence = (node as unknown as { confidence?: number }).confidence;
        if (confidence !== undefined && confidence < 0.7) {
          weakNodes.push(node.id ?? 'unknown');
          continue;
        }

        // Check if node is missing embeddings (indicates incomplete extraction)
        const graphNode = graph.nodes.find(n => n.id === node.id);
        if (!graphNode?.embedding || graphNode.embedding.length === 0) {
          weakNodes.push(node.id ?? 'unknown');
        }
      }
    }

    // Find orphan nodes (nodes with no edges in large graph)
    const nodeIds = new Set(result.nodes?.map(n => n.id) ?? []);
    for (const nodeId of nodeIds) {
      const edges = graph.edges.filter(e => e.source === nodeId || e.target === nodeId);
      if (edges.length === 0 && graph.nodes.length > 10) {
        weakNodes.push(nodeId ?? 'unknown');
      }
    }

    return [...new Set(weakNodes)]; // Deduplicate
  }

  /**
   * Find extraction cache entries relevant to this query
   */
  private findCacheEntries(result: QueryResult): string[] {
    const entries: string[] = [];

    // Check if nodes were from cache
    if (result.nodes) {
      for (const node of result.nodes) {
        const cacheKey = `extraction:${node.id}`;
        if (this.extractionCache.has(cacheKey)) {
          entries.push(cacheKey);
        }
      }
    }

    return entries;
  }

  /**
   * Calculate cache miss ratio
   */
  private calculateCacheMissRatio(
    forward: TraceResult['forwardPath'],
    backward: TraceResult['backwardPath']
  ): number {
    if (forward.graphNodesTraversed.length === 0) return 0;
    const misses = backward.extractionCacheEntries.length;
    return 1 - (misses / forward.graphNodesTraversed.length);
  }

  /**
   * Add an extraction cache entry
   */
  addCacheEntry(nodeId: string, version: string): void {
    this.extractionCache.set(`extraction:${nodeId}`, {
      version,
      timestamp: Date.now(),
    });
  }

  /**
   * Set prompt version
   */
  setPromptVersion(version: string): void {
    this.promptVersion = version;
  }

  /**
   * Get prompt version
   */
  getPromptVersion(): string {
    return this.promptVersion;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.extractionCache.clear();
  }
}

/**
 * Create a tracer instance
 */
export function createTracer(promptVersion?: string): Tracer {
  return new Tracer(promptVersion);
}
