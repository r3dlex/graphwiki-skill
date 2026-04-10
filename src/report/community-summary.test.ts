import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommunitySummarizer } from './community-summary.js';
import type { LLMProvider, GraphNode, GraphEdge } from '../types.js';
import type { CommunityMeta } from '../wiki/types.js';

const mockProvider: LLMProvider = {
  complete: vi.fn(),
  supportedDocumentFormats: () => ['txt', 'md'],
  supportedImageFormats: () => [],
  maxDocumentPages: () => 100,
  maxImageResolution: () => 4096,
  extractFromDocument: vi.fn(),
  extractFromImage: vi.fn(),
};

describe('CommunitySummarizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('summarize', () => {
    it('should generate a summary for a community', async () => {
      const summarizer = new CommunitySummarizer(mockProvider);
      const community: CommunityMeta = {
        id: 1,
        node_count: 3,
        label: 'Test Community',
      };
      const nodes: GraphNode[] = [
        { id: 'n1', label: 'Node A', type: 'concept', community: 1 },
        { id: 'n2', label: 'Node B', type: 'entity', community: 1 },
        { id: 'n3', label: 'Node C', type: 'source', community: 1, provenance: ['src.pdf'] },
      ];
      const edges: GraphEdge[] = [
        { id: 'e1', source: 'n1', target: 'n2', weight: 0.8, label: 'relates' },
        { id: 'e2', source: 'n2', target: 'n3', weight: 0.5 },
      ];

      mockProvider.complete.mockResolvedValue({
        content:
          'Test Community is a cohesive group focused on foundational concepts and their practical applications. Node A serves as a central concept that connects to Node B, an entity implementation, which in turn references Node C as a source.',
        usage: { input_tokens: 150, output_tokens: 80, total_tokens: 230 },
      });

      const summary = await summarizer.summarize(community, nodes, edges);

      expect(summary).toBeTruthy();
      expect(summary.length).toBeGreaterThan(0);
      expect(mockProvider.complete).toHaveBeenCalled();
    });

    it('should include provenance information when available', async () => {
      const summarizer = new CommunitySummarizer(mockProvider);
      const community: CommunityMeta = { id: 2, node_count: 1 };
      const nodes: GraphNode[] = [
        {
          id: 'n1',
          label: 'Node X',
          type: 'source',
          community: 2,
          provenance: ['paper.pdf', 'article.md'],
        },
      ];
      const edges: GraphEdge[] = [];

      mockProvider.complete.mockResolvedValue({
        content: 'A single-source node with two provenance documents.',
        usage: { input_tokens: 50, output_tokens: 20, total_tokens: 70 },
      });

      await summarizer.summarize(community, nodes, edges);

      const callArgs = mockProvider.complete.mock.calls[0];
      const userPrompt = callArgs[0][1].content;
      expect(userPrompt).toContain('paper.pdf');
      expect(userPrompt).toContain('article.md');
    });

    it('should handle empty community gracefully', async () => {
      const summarizer = new CommunitySummarizer(mockProvider);
      const community: CommunityMeta = { id: 99, node_count: 0 };
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      mockProvider.complete.mockResolvedValue({
        content: 'An empty community with no nodes or edges.',
        usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
      });

      const summary = await summarizer.summarize(community, nodes, edges);

      expect(summary).toBeTruthy();
    });
  });
});
