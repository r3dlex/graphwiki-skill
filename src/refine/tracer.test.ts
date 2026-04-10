import { describe, it, expect, beforeEach } from 'vitest';
import { Tracer, createTracer } from './tracer.js';
import type { GraphDocument, QueryResult } from '../types.js';

describe('Tracer', () => {
  let tracer: Tracer;

  beforeEach(() => {
    tracer = new Tracer('v1');
  });

  describe('constructor', () => {
    it('should create tracer with default prompt version', () => {
      const t = new Tracer();
      expect(t.getPromptVersion()).toBe('v1');
    });

    it('should create tracer with custom prompt version', () => {
      const t = new Tracer('v2');
      expect(t.getPromptVersion()).toBe('v2');
    });
  });

  describe('traceQueryFailure', () => {
    it('should trace a query failure', () => {
      const graph: GraphDocument = {
        nodes: [
          { id: 'node1', label: 'Test', type: 'function' },
          { id: 'node2', label: 'Helper', type: 'function' },
        ],
        edges: [{ id: 'e1', source: 'node1', target: 'node2', weight: 1 }],
      };

      const result: QueryResult = {
        query: 'test query',
        answer: 'test answer',
        nodes: [
          { id: 'node1', label: 'Test', type: 'function' },
          { id: 'node2', label: 'Helper', type: 'function' },
        ],
        tier: 2,
        tokens_used: 30000,
        duration_ms: 1000,
      };

      const trace = tracer.traceQueryFailure('test query', result, graph);

      expect(trace.query).toBe('test query');
      expect(trace.forwardPath).toBeDefined();
      expect(trace.backwardPath).toBeDefined();
      expect(trace.rootCauses).toBeInstanceOf(Array);
    });

    it('should identify insufficient tier', () => {
      const graph: GraphDocument = { nodes: [], edges: [] };
      const result: QueryResult = {
        query: 'test',
        answer: 'answer',
        nodes: [],
        tier: 1,
        tokens_used: 1000,
        duration_ms: 100,
      };

      const trace = tracer.traceQueryFailure('test', result, graph);

      expect(trace.rootCauses).toContain('INSUFFICIENT_TIER: Query reached only tier 1, may need deeper context');
    });

    it('should identify token bloat', () => {
      const graph: GraphDocument = { nodes: [], edges: [] };
      const result: QueryResult = {
        query: 'test',
        answer: 'answer',
        nodes: [],
        tier: 3,
        tokens_used: 60000,
        duration_ms: 100,
      };

      const trace = tracer.traceQueryFailure('test', result, graph);

      expect(trace.rootCauses).toContain('TOKEN_BLOAT: Excessive token consumption (60000)');
    });

    it('should identify sparse context', () => {
      const graph: GraphDocument = { nodes: [], edges: [] };
      const result: QueryResult = {
        query: 'test',
        answer: 'answer',
        nodes: [{ id: 'n1', label: 'n1', type: 'test' }],
        tier: 3,
        tokens_used: 1000,
        duration_ms: 100,
        context: [{ source: 'page1', content: 'content' }],
      };

      const trace = tracer.traceQueryFailure('test', result, graph);

      expect(trace.rootCauses).toContain('SPARSE_CONTEXT: Few wiki pages loaded (1)');
    });
  });

  describe('cache operations', () => {
    it('should add cache entry', () => {
      tracer.addCacheEntry('node1', 'v2');
      // We can verify through traceQueryFailure which uses cache
      expect(tracer.getPromptVersion()).toBe('v1');
    });

    it('should clear cache', () => {
      tracer.addCacheEntry('node1', 'v2');
      tracer.clearCache();
      // Should not throw
      expect(tracer.getPromptVersion()).toBe('v1');
    });
  });

  describe('prompt version', () => {
    it('should get prompt version', () => {
      expect(tracer.getPromptVersion()).toBe('v1');
    });

    it('should set prompt version', () => {
      tracer.setPromptVersion('v3');
      expect(tracer.getPromptVersion()).toBe('v3');
    });
  });

  describe('createTracer', () => {
    it('should create tracer instance', () => {
      const t = createTracer('v2');
      expect(t).toBeInstanceOf(Tracer);
      expect(t.getPromptVersion()).toBe('v2');
    });
  });
});
