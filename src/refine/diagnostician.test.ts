import { describe, it, expect } from 'vitest';
import { Diagnostician, createDiagnostician } from './diagnostician.js';
import type { GraphNode, TraceResult } from '../types.js';

describe('Diagnostician', () => {
  let diagnostician: Diagnostician;

  beforeEach(() => {
    diagnostician = new Diagnostician();
  });

  describe('computeGranularityGap', () => {
    it('should return 1.0 for perfect match', () => {
      expect(diagnostician.computeGranularityGap(100, 100)).toBe(1.0);
    });

    it('should return less than 1 for under-extraction', () => {
      expect(diagnostician.computeGranularityGap(100, 50)).toBe(0.5);
    });

    it('should return greater than 1 for over-extraction', () => {
      expect(diagnostician.computeGranularityGap(50, 100)).toBe(2.0);
    });

    it('should return 0 for 0 ast nodes', () => {
      expect(diagnostician.computeGranularityGap(0, 50)).toBe(0);
    });
  });

  describe('computeNodeDensity', () => {
    it('should compute nodes per 1000 words', () => {
      expect(diagnostician.computeNodeDensity(1000, 10)).toBe(10);
    });

    it('should handle zero word count', () => {
      expect(diagnostician.computeNodeDensity(0, 10)).toBe(0);
    });

    it('should handle small documents', () => {
      expect(diagnostician.computeNodeDensity(100, 5)).toBe(50);
    });
  });

  describe('identifyMissingElements', () => {
    it('should find missing AST nodes', () => {
      const astNodes: GraphNode[] = [
        { id: '1', label: 'FunctionA', type: 'function' },
        { id: '2', label: 'FunctionB', type: 'function' },
        { id: '3', label: 'Helper', type: 'function' },
      ];

      const llmNodes: GraphNode[] = [
        { id: '1', label: 'FunctionA', type: 'function' },
        // FunctionB and Helper are missing
      ];

      const missing = diagnostician.identifyMissingElements(astNodes, llmNodes);

      expect(missing).toContain('MISSING_FUNCTION: FunctionB');
      expect(missing).toContain('MISSING_FUNCTION: Helper');
      expect(missing.length).toBe(2);
    });

    it('should handle fuzzy matching', () => {
      const astNodes: GraphNode[] = [
        { id: '1', label: 'my_function', type: 'function' },
      ];

      const llmNodes: GraphNode[] = [
        { id: '1', label: 'MyFunction', type: 'function' },
      ];

      const missing = diagnostician.identifyMissingElements(astNodes, llmNodes);

      // Should match with fuzzy matching
      expect(missing.length).toBe(0);
    });

    it('should return empty for complete match', () => {
      const astNodes: GraphNode[] = [
        { id: '1', label: 'Test', type: 'function' },
      ];

      const llmNodes: GraphNode[] = [
        { id: '1', label: 'Test', type: 'function' },
      ];

      const missing = diagnostician.identifyMissingElements(astNodes, llmNodes);
      expect(missing.length).toBe(0);
    });
  });

  describe('diagnoseFailure', () => {
    it('should diagnose weak nodes', () => {
      const trace: TraceResult = {
        query: 'test query',
        forwardPath: {
          wikiPagesLoaded: ['page1.md'],
          graphNodesTraversed: ['node1'],
          tierReached: 1,
          tokensConsumed: 30000,
        },
        backwardPath: {
          weakNodes: ['node1'],
          extractionCacheEntries: [],
          extractionPromptVersion: 'v1',
        },
        rootCauses: ['INSUFFICIENT_TIER'],
      };

      const diagnostics = diagnostician.diagnoseFailure(trace);

      expect(diagnostics.length).toBeGreaterThan(0);

      // Should have node1 diagnostic
      const node1Diag = diagnostics.find(d => d.nodeId === 'node1');
      expect(node1Diag).toBeDefined();
      expect(node1Diag?.failureModes).toContain('INSUFFICIENT_CONTEXT_TIER');
    });

    it('should identify cache system issues', () => {
      const trace: TraceResult = {
        query: 'test',
        forwardPath: {
          wikiPagesLoaded: ['page1.md', 'page2.md'],
          graphNodesTraversed: ['node1'],
          tierReached: 3,
          tokensConsumed: 30000,
        },
        backwardPath: {
          weakNodes: [],
          extractionCacheEntries: [], // Empty = cache misses
          extractionPromptVersion: 'v2',
        },
        rootCauses: [],
      };

      const diagnostics = diagnostician.diagnoseFailure(trace);

      const cacheDiag = diagnostics.find(d => d.nodeId === 'SYSTEM');
      expect(cacheDiag).toBeDefined();
      expect(cacheDiag?.failureModes).toContain('CACHE_MISS');
    });

    it('should identify prompt version issues', () => {
      const trace: TraceResult = {
        query: 'test',
        forwardPath: {
          wikiPagesLoaded: ['page1.md'],
          graphNodesTraversed: [],
          tierReached: 2,
          tokensConsumed: 5000,
        },
        backwardPath: {
          weakNodes: [],
          extractionCacheEntries: ['entry1'],
          extractionPromptVersion: 'v1',
        },
        rootCauses: [],
      };

      const diagnostics = diagnostician.diagnoseFailure(trace);

      const promptDiag = diagnostics.find(d => d.nodeId === 'PROMPTS');
      expect(promptDiag).toBeDefined();
      expect(promptDiag?.failureModes).toContain('OUTDATED_PROMPTS');
    });
  });

  describe('analyzeExtractionPattern', () => {
    it('should return excellent for 1:1 ratio', () => {
      const result = diagnostician.analyzeExtractionPattern(1000, 100, 95, 10000);

      expect(result.granularityGap).toBe(0.95);
      expect(result.quality).toBe('excellent');
    });

    it('should return good for reasonable ratios', () => {
      const result = diagnostician.analyzeExtractionPattern(1000, 100, 60, 10000);

      expect(result.quality).toBe('good');
    });

    it('should return fair for significant under-extraction', () => {
      const result = diagnostician.analyzeExtractionPattern(1000, 100, 30, 10000);

      expect(result.quality).toBe('fair');
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should recommend for low density', () => {
      const result = diagnostician.analyzeExtractionPattern(1000, 100, 2, 10000);

      expect(result.nodeDensity).toBe(0.2);
      expect(result.recommendations.some(r => r.includes('density'))).toBe(true);
    });
  });

  describe('createDiagnostician', () => {
    it('should create diagnostician instance', () => {
      const d = createDiagnostician();
      expect(d).toBeInstanceOf(Diagnostician);
    });
  });
});
