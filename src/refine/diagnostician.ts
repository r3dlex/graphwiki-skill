// Granularity gap analysis for GraphWiki v2
// Analyzes extraction quality and identifies missing elements

import type { GraphNode, WeakNodeDiagnostic, TraceResult } from '../types.js';

/**
 * Diagnostician - Performs granularity gap analysis
 *
 * Computes:
 * - Granularity gap between AST nodes and LLM-extracted nodes
 * - Node density analysis
 * - Missing element identification
 * - Failure diagnosis
 */
export class Diagnostician {
  /**
   * Compute granularity gap between AST parsing and LLM extraction
   * @param astNodes - Number of nodes from AST parsing
   * @param llmNodes - Number of nodes extracted by LLM
   * @returns Gap ratio (1.0 = perfect match, <1 = under-extraction, >1 = over-extraction)
   */
  computeGranularityGap(astNodes: number, llmNodes: number): number {
    if (astNodes === 0) return 0;
    return llmNodes / astNodes;
  }

  /**
   * Compute node density (how many nodes per word)
   * @param wordCount - Total words in source
   * @param nodesExtracted - Nodes extracted
   * @returns Nodes per 1000 words
   */
  computeNodeDensity(wordCount: number, nodesExtracted: number): number {
    if (wordCount === 0) return 0;
    return (nodesExtracted / wordCount) * 1000;
  }

  /**
   * Identify missing elements by comparing AST nodes to LLM nodes
   */
  identifyMissingElements(astNodes: GraphNode[], llmNodes: GraphNode[]): string[] {
    const missing: string[] = [];
    const llmLabels = new Set(llmNodes.map(n => n.label.toLowerCase()));

    // Find AST nodes that have no corresponding LLM node
    for (const astNode of astNodes) {
      const astLabel = astNode.label.toLowerCase();
      const hasMatch = llmLabels.has(astLabel) ||
        llmLabels.has(astLabel.replace(/[_-]/g, '')) ||
        llmNodes.some(llm =>
          llm.label.toLowerCase().includes(astLabel) ||
          astLabel.includes(llm.label.toLowerCase())
        );

      if (!hasMatch) {
        missing.push(`MISSING_${astNode.type.toUpperCase()}: ${astNode.label}`);
      }
    }

    return missing;
  }

  /**
   * Diagnose failure from trace result
   */
  diagnoseFailure(trace: TraceResult): WeakNodeDiagnostic[] {
    const diagnostics: WeakNodeDiagnostic[] = [];

    // Analyze each weak node
    for (const nodeId of trace.backwardPath.weakNodes) {
      const diagnostic = this.diagnoseWeakNode(nodeId, trace);
      diagnostics.push(diagnostic);
    }

    // Check for systemic issues
    if (trace.backwardPath.extractionCacheEntries.length === 0) {
      diagnostics.push({
        nodeId: 'SYSTEM',
        nodeLabel: 'Cache System',
        failureModes: ['CACHE_MISS', 'STALE_DATA'],
        suggestedPrompts: [
          'Enable extraction caching for repeated source types',
          'Implement cache invalidation for modified sources',
        ],
        estimatedImpact: 0.3,
      });
    }

    // Check for prompt version issues
    if (trace.backwardPath.extractionPromptVersion === 'v1') {
      diagnostics.push({
        nodeId: 'PROMPTS',
        nodeLabel: 'Extraction Prompts',
        failureModes: ['OUTDATED_PROMPTS', 'LOW_COVERAGE'],
        suggestedPrompts: [
          'Update to latest prompt version with improved extraction patterns',
          'Add examples for edge cases in current codebase',
        ],
        estimatedImpact: 0.4,
      });
    }

    // Sort by impact
    return diagnostics.sort((a, b) => b.estimatedImpact - a.estimatedImpact);
  }

  /**
   * Diagnose a single weak node
   */
  private diagnoseWeakNode(nodeId: string, trace: TraceResult): WeakNodeDiagnostic {
    const failureModes: string[] = [];
    const suggestedPrompts: string[] = [];
    let estimatedImpact = 0.1;

    // Check tier reached
    if (trace.forwardPath.tierReached < 3) {
      failureModes.push('INSUFFICIENT_CONTEXT_TIER');
      suggestedPrompts.push('Include more neighbor context in extraction prompt');
      estimatedImpact += 0.15;
    }

    // Check if node was in wiki pages
    const inWiki = trace.forwardPath.wikiPagesLoaded.some(p => p.includes(nodeId));
    if (!inWiki) {
      failureModes.push('NOT_IN_WIKI_CONTEXT');
      suggestedPrompts.push('Add step to ensure node is included in wiki compilation');
      estimatedImpact += 0.2;
    }

    // Check token consumption
    if (trace.forwardPath.tokensConsumed > 40000) {
      failureModes.push('CONTEXT_OVERFLOW');
      suggestedPrompts.push('Implement chunked extraction for large contexts');
      estimatedImpact += 0.1;
    }

    return {
      nodeId,
      nodeLabel: this.getNodeLabel(nodeId, trace),
      failureModes,
      suggestedPrompts,
      estimatedImpact,
    };
  }

  /**
   * Get node label from trace
   */
  private getNodeLabel(nodeId: string, trace: TraceResult): string {
    // Try to find in graph nodes from forward path
    for (const pathNode of trace.forwardPath.graphNodesTraversed) {
      if (pathNode === nodeId) {
        return nodeId;
      }
    }
    return nodeId;
  }

  /**
   * Analyze extraction patterns
   */
  analyzeExtractionPattern(
    sourceSize: number,
    astNodeCount: number,
    llmNodeCount: number,
    wordCount: number
  ): {
    granularityGap: number;
    nodeDensity: number;
    quality: 'excellent' | 'good' | 'fair' | 'poor';
    recommendations: string[];
  } {
    const granularityGap = this.computeGranularityGap(astNodeCount, llmNodeCount);
    const nodeDensity = this.computeNodeDensity(wordCount, llmNodeCount);

    // Determine quality
    let quality: 'excellent' | 'good' | 'fair' | 'poor';
    const recommendations: string[] = [];

    if (granularityGap >= 0.8 && granularityGap <= 1.2) {
      quality = 'excellent';
    } else if (granularityGap >= 0.5 && granularityGap <= 2.0) {
      quality = 'good';
      recommendations.push('Consider fine-tuning extraction prompts for better granularity');
    } else if (granularityGap >= 0.2) {
      quality = 'fair';
      recommendations.push('Significant under-extraction detected. Review prompt coverage.');
    } else {
      quality = 'poor';
      recommendations.push('Severe under-extraction. Major prompt revision needed.');
    }

    // Check density
    if (nodeDensity < 5) {
      recommendations.push('Low node density. Consider more thorough extraction.');
      quality = quality === 'excellent' ? 'good' : quality;
    } else if (nodeDensity > 50) {
      recommendations.push('Very high node density. May include noise.');
    }

    return {
      granularityGap,
      nodeDensity,
      quality,
      recommendations,
    };
  }
}

/**
 * Create diagnostician instance
 */
export function createDiagnostician(): Diagnostician {
  return new Diagnostician();
}
