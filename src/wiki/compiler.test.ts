import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WikiCompiler } from './compiler.js';
import type { LLMProvider, CompletionResult } from '../types.js';
import type { CommunityMeta, WikiPage } from './types.js';

const mockProvider: LLMProvider = {
  complete: vi.fn(),
  supportedDocumentFormats: () => ['txt', 'md'],
  supportedImageFormats: () => [],
  maxDocumentPages: () => 100,
  maxImageResolution: () => 4096,
  extractFromDocument: vi.fn(),
  extractFromImage: vi.fn(),
};

describe('WikiCompiler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('compileStage1', () => {
    it('should generate section headers and outline from community data', async () => {
      const compiler = new WikiCompiler(mockProvider);
      const community: CommunityMeta = {
        id: 1,
        node_count: 3,
        label: 'Test Community',
      };
      const nodes = [
        { id: 'n1', label: 'Node 1', type: 'concept' },
        { id: 'n2', label: 'Node 2', type: 'entity' },
        { id: 'n3', label: 'Node 3', type: 'source' },
      ];
      const edges = [
        { id: 'e1', source: 'n1', target: 'n2', weight: 1, label: 'relates' },
        { id: 'e2', source: 'n2', target: 'n3', weight: 0.5 },
      ];

      mockProvider.complete.mockResolvedValue({
        content: `Overview of Test Community with important topics.

1. Introduction
2. Core Concepts
3. Related Entities`,
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      });

      const result = await compiler.compileStage1(community, nodes, edges);

      expect(result.section_headers).toEqual([
        'Introduction',
        'Core Concepts',
        'Related Entities',
      ]);
      expect(result.outline).toBeTruthy();
      expect(result.tokens_used).toBeGreaterThan(0);
    });
  });

  describe('compileStage2', () => {
    it('should expand a section with content', async () => {
      const compiler = new WikiCompiler(mockProvider);
      const nodes = [
        { id: 'n1', label: 'Node 1', type: 'concept' },
      ];
      const edges: import('../types.js').GraphEdge[] = [];

      mockProvider.complete.mockResolvedValue({
        content: 'This section covers the core concepts in detail.',
        usage: { input_tokens: 50, output_tokens: 30, total_tokens: 80 },
      });

      const result = await compiler.compileStage2('Core Concepts', nodes, edges);

      expect(result.section_content).toContain('core concepts');
      expect(result.tokens_used).toBeGreaterThan(0);
    });
  });

  describe('compileStage3', () => {
    it('should verify source content', async () => {
      const compiler = new WikiCompiler(mockProvider);

      mockProvider.complete.mockResolvedValue({
        content: 'The content has been verified and appears accurate.',
        usage: { input_tokens: 200, output_tokens: 100, total_tokens: 300 },
      });

      const result = await compiler.compileStage3('n1', 'Some source content here');

      expect(result.deep_content).toBeTruthy();
      expect(result.source_verified).toBe(true);
    });

    it('should mark source as not verified when content mentions incorrect', async () => {
      const compiler = new WikiCompiler(mockProvider);

      mockProvider.complete.mockResolvedValue({
        content: 'This content is incorrect and needs revision.',
        usage: { input_tokens: 200, output_tokens: 100, total_tokens: 300 },
      });

      const result = await compiler.compileStage3('n1', 'Some source content');

      expect(result.source_verified).toBe(false);
    });
  });

  describe('compileCommunity', () => {
    it('should compile a full community wiki page', async () => {
      const compiler = new WikiCompiler(mockProvider);
      const community: CommunityMeta = {
        id: 1,
        node_count: 2,
        label: 'My Community',
      };
      const nodes = [
        { id: 'n1', label: 'Concept A', type: 'concept' },
        { id: 'n2', label: 'Entity B', type: 'entity' },
      ];
      const edges = [
        { id: 'e1', source: 'n1', target: 'n2', weight: 1 },
      ];

      mockProvider.complete
        .mockResolvedValueOnce({
          content: '1. Overview\n2. Details\n3. Summary',
          usage: { input_tokens: 50, output_tokens: 20, total_tokens: 70 },
        })
        .mockResolvedValueOnce({
          content: 'Detailed content for Overview section.',
          usage: { input_tokens: 30, output_tokens: 15, total_tokens: 45 },
        })
        .mockResolvedValueOnce({
          content: 'Detailed content for Details section.',
          usage: { input_tokens: 30, output_tokens: 15, total_tokens: 45 },
        })
        .mockResolvedValueOnce({
          content: 'Detailed content for Summary section.',
          usage: { input_tokens: 30, output_tokens: 15, total_tokens: 45 },
        });

      const page = await compiler.compileCommunity(community, nodes, edges);

      expect(page.frontmatter.label).toBe('My Community');
      expect(page.frontmatter.community).toBe(1);
      expect(page.content).toContain('# My Community');
    });
  });

  describe('compileAll', () => {
    it('should compile communities in priority order with parallelism', async () => {
      const compiler = new WikiCompiler(mockProvider, { parallel_limit: 2 });
      const communities: CommunityMeta[] = [
        { id: 1, node_count: 2, label: 'Small Community' },
        { id: 2, node_count: 5, label: 'Large Community' },
        { id: 3, node_count: 3, label: 'Medium Community', god_node_ids: ['n1'] },
      ];
      const graph = {
        nodes: [
          { id: 'n1', label: 'N1', type: 'concept', community: 1 },
          { id: 'n2', label: 'N2', type: 'concept', community: 1 },
          { id: 'n3', label: 'N3', type: 'concept', community: 2 },
          { id: 'n4', label: 'N4', type: 'concept', community: 2 },
          { id: 'n5', label: 'N5', type: 'concept', community: 2 },
          { id: 'n6', label: 'N6', type: 'concept', community: 3 },
          { id: 'n7', label: 'N7', type: 'concept', community: 3 },
          { id: 'n8', label: 'N8', type: 'concept', community: 3 },
        ],
        edges: [],
      };

      mockProvider.complete
        .mockResolvedValueOnce({
          content: '1. Overview\n2. Details',
          usage: { input_tokens: 50, output_tokens: 20, total_tokens: 70 },
        })
        .mockResolvedValueOnce({
          content: '1. Overview\n2. Details',
          usage: { input_tokens: 50, output_tokens: 20, total_tokens: 70 },
        })
        .mockResolvedValueOnce({
          content: 'Content.',
          usage: { input_tokens: 30, output_tokens: 10, total_tokens: 40 },
        })
        .mockResolvedValueOnce({
          content: 'Content.',
          usage: { input_tokens: 30, output_tokens: 10, total_tokens: 40 },
        })
        .mockResolvedValueOnce({
          content: 'Content.',
          usage: { input_tokens: 30, output_tokens: 10, total_tokens: 40 },
        })
        .mockResolvedValueOnce({
          content: 'Content.',
          usage: { input_tokens: 30, output_tokens: 10, total_tokens: 40 },
        })
        .mockResolvedValueOnce({
          content: 'Content.',
          usage: { input_tokens: 30, output_tokens: 10, total_tokens: 40 },
        })
        .mockResolvedValueOnce({
          content: 'Content.',
          usage: { input_tokens: 30, output_tokens: 10, total_tokens: 40 },
        });

      const pages = await compiler.compileAll(communities, graph);

      expect(pages.length).toBe(3);
      // Large community (most nodes) should be first
      expect(pages[0].frontmatter.label).toBe('Large Community');
    });
  });
});
