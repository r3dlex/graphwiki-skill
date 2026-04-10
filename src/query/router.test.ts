import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryRouter } from './router.js';
import type { GraphDocument, LLMProvider } from '../types.js';

const mockProvider: LLMProvider = {
  complete: vi.fn(),
  supportedDocumentFormats: () => ['txt', 'md'],
  supportedImageFormats: () => [],
  maxDocumentPages: () => 100,
  maxImageResolution: () => 4096,
  extractFromDocument: vi.fn(),
  extractFromImage: vi.fn(),
};

describe('QueryRouter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('ask', () => {
    it('should answer structural questions at Tier 0', async () => {
      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'AI', type: 'concept' },
          { id: 'n2', label: 'ML', type: 'concept' },
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2', weight: 1 }],
      };

      const router = new QueryRouter(graph, '/tmp/wiki', mockProvider);

      const result = await router.ask('How many nodes are in the graph?');

      expect(result.tier_reached).toBe(0);
      expect(result.answer).toContain('2');
    });

    it('should route to Tier 1 when Tier 0 cannot answer', async () => {
      const graph: GraphDocument = {
        nodes: [{ id: 'n1', label: 'AI', type: 'concept' }],
        edges: [],
      };

      mockProvider.complete.mockResolvedValue({
        content: 'Based on the report, AI is an important concept in the graph.',
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      });

      const router = new QueryRouter(graph, '/tmp/wiki', mockProvider);
      const result = await router.ask('Tell me about AI');

      expect(result.tier_reached).toBeGreaterThanOrEqual(1);
    });

    it('should return tier 1 when report is not found', async () => {
      const graph: GraphDocument = {
        nodes: [{ id: 'n1', label: 'AI', type: 'concept' }],
        edges: [],
      };

      mockProvider.complete.mockResolvedValue({
        content: 'AI is a key concept.',
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      });

      const router = new QueryRouter(graph, '/tmp/wiki', mockProvider);
      const result = await router.ask('Tell me about AI');

      // Report not found at /tmp/wiki/../graphwiki-out/ so tier 1 returns early
      expect(result.tier_reached).toBe(1);
      expect(result.answer).toContain('not found');
    });

    it('should respect budget parameter', async () => {
      const graph: GraphDocument = {
        nodes: [{ id: 'n1', label: 'Node', type: 'concept' }],
        edges: [],
      };

      mockProvider.complete.mockResolvedValue({
        content: 'Result content.',
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      });

      const router = new QueryRouter(graph, '/tmp/wiki', mockProvider);
      const result = await router.ask('Question', 5); // very low budget

      expect(result.tokens_consumed).toBeLessThanOrEqual(5);
    });
  });

  describe('tier 0 traversal', () => {
    it('should answer edge count questions', async () => {
      const graph: GraphDocument = {
        nodes: [],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2', weight: 1 },
          { id: 'e2', source: 'n2', target: 'n3', weight: 1 },
        ],
      };

      const router = new QueryRouter(graph, '/tmp/wiki', mockProvider);
      const result = await router.ask('How many edges are there?');

      expect(result.tier_reached).toBe(0);
      expect(result.answer).toContain('2');
    });

    it('should answer what-is questions for nodes', async () => {
      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'BERT', type: 'model', community: 5 },
        ],
        edges: [],
      };

      const router = new QueryRouter(graph, '/tmp/wiki', mockProvider);
      const result = await router.ask('What is a BERT node?');

      expect(result.tier_reached).toBe(0);
      expect(result.answer).toContain('BERT');
      expect(result.answer).toContain('model');
    });
  });
});
