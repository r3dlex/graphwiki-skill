// Tests for html.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { writeFile } from 'fs/promises';
import type { GraphDocument, GraphNode, GraphEdge } from '../types.js';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

describe('html', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateHtml', () => {
    it('should generate valid HTML document structure', async () => {
      const { exportHtml } = await import('./html.js');
      const graph: GraphDocument = { nodes: [], edges: [] };

      await exportHtml(graph, '/tmp/test.html');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('<!DOCTYPE html>');
      expect(writtenContent).toContain('<html lang="en">');
      expect(writtenContent).toContain('</html>');
    });

    it('should include vis.js from CDN', async () => {
      const { exportHtml } = await import('./html.js');
      const graph: GraphDocument = { nodes: [], edges: [] };

      await exportHtml(graph, '/tmp/test.html');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('unpkg.com/vis-network');
    });

    it('should include graph container', async () => {
      const { exportHtml } = await import('./html.js');
      const graph: GraphDocument = { nodes: [], edges: [] };

      await exportHtml(graph, '/tmp/test.html');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('id="graph"');
      expect(writtenContent).toContain('width: 100vw');
      expect(writtenContent).toContain('height: calc(100vh - 50px)');
    });

    it('should include toolbar with title', async () => {
      const { exportHtml } = await import('./html.js');
      const graph: GraphDocument = { nodes: [], edges: [] };

      await exportHtml(graph, '/tmp/test.html');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('GraphWiki');
      expect(writtenContent).toContain('Toggle Physics');
      expect(writtenContent).toContain('Fit');
    });

    it('should include node details panel', async () => {
      const { exportHtml } = await import('./html.js');
      const graph: GraphDocument = { nodes: [], edges: [] };

      await exportHtml(graph, '/tmp/test.html');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('id="details"');
      expect(writtenContent).toContain('Node Details');
    });
  });

  describe('generateNodes', () => {
    it('should serialize node data for vis.js', async () => {
      const { exportHtml } = await import('./html.js');
      const node: GraphNode = {
        id: 'node1',
        label: 'Test Node',
        type: 'function',
        community: 3,
        provenance: [],
      };
      const graph: GraphDocument = { nodes: [node], edges: [] };

      await exportHtml(graph, '/tmp/test.html');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('id: "node1"');
      expect(writtenContent).toContain('label: "Test Node"');
      expect(writtenContent).toContain('type: "function"');
      expect(writtenContent).toContain('community: 3');
    });

    it('should handle community as null', async () => {
      const { exportHtml } = await import('./html.js');
      const node: GraphNode = { id: 'node1', label: 'Test', type: 'concept' };
      const graph: GraphDocument = { nodes: [node], edges: [] };

      await exportHtml(graph, '/tmp/test.html');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('community: -1');
    });

    it('should include provenance array', async () => {
      const { exportHtml } = await import('./html.js');
      const node: GraphNode = {
        id: 'node1',
        label: 'Test',
        type: 'concept',
        provenance: ['source:2024-01-01'],
      };
      const graph: GraphDocument = { nodes: [node], edges: [] };

      await exportHtml(graph, '/tmp/test.html');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('provenance:');
      expect(writtenContent).toContain('source');
    });
  });

  describe('generateEdges', () => {
    it('should serialize edge data for vis.js', async () => {
      const { exportHtml } = await import('./html.js');
      const edge: GraphEdge = {
        id: 'edge1',
        source: 'node1',
        target: 'node2',
        weight: 1.5,
        label: 'calls',
      };
      const graph: GraphDocument = {
        nodes: [{ id: 'node1', label: 'N1', type: 'concept' }, { id: 'node2', label: 'N2', type: 'concept' }],
        edges: [edge],
      };

      await exportHtml(graph, '/tmp/test.html');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('from: "node1"');
      expect(writtenContent).toContain('to: "node2"');
      expect(writtenContent).toContain('value: 1.5');
      expect(writtenContent).toContain('label: "calls"');
    });

    it('should handle edge without label', async () => {
      const { exportHtml } = await import('./html.js');
      const edge: GraphEdge = {
        id: 'edge1',
        source: 'node1',
        target: 'node2',
        weight: 1,
      };
      const graph: GraphDocument = {
        nodes: [{ id: 'node1', label: 'N1', type: 'concept' }, { id: 'node2', label: 'N2', type: 'concept' }],
        edges: [edge],
      };

      await exportHtml(graph, '/tmp/test.html');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('label: null');
    });
  });

  describe('generateStats', () => {
    it('should count nodes and edges', async () => {
      const { exportHtml } = await import('./html.js');
      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'N1', type: 'concept' },
          { id: 'n2', label: 'N2', type: 'concept' },
          { id: 'n3', label: 'N3', type: 'concept' },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2', weight: 1 },
          { id: 'e2', source: 'n2', target: 'n3', weight: 1 },
        ],
      };

      await exportHtml(graph, '/tmp/test.html');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('3 nodes');
      expect(writtenContent).toContain('2 edges');
    });

    it('should count unique communities', async () => {
      const { exportHtml } = await import('./html.js');
      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'N1', type: 'concept', community: 1 },
          { id: 'n2', label: 'N2', type: 'concept', community: 1 },
          { id: 'n3', label: 'N3', type: 'concept', community: 2 },
          { id: 'n4', label: 'N4', type: 'concept' }, // no community
        ],
        edges: [],
      };

      await exportHtml(graph, '/tmp/test.html');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('3 communities');
    });
  });

  describe('escapeString', () => {
    it('should escape backslashes', async () => {
      const { exportHtml } = await import('./html.js');
      const node: GraphNode = { id: 'node1', label: 'Path\\to\\file', type: 'concept' };
      const graph: GraphDocument = { nodes: [node], edges: [] };

      await exportHtml(graph, '/tmp/test.html');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('\\\\');
    });

    it('should escape double quotes', async () => {
      const { exportHtml } = await import('./html.js');
      const node: GraphNode = { id: 'node1', label: 'Say "Hello"', type: 'concept' };
      const graph: GraphDocument = { nodes: [node], edges: [] };

      await exportHtml(graph, '/tmp/test.html');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('\\"');
    });

    it('should escape newlines', async () => {
      const { exportHtml } = await import('./html.js');
      const node: GraphNode = { id: 'node1', label: 'Line1\nLine2', type: 'concept' };
      const graph: GraphDocument = { nodes: [node], edges: [] };

      await exportHtml(graph, '/tmp/test.html');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('\\n');
    });

    it('should escape carriage returns', async () => {
      const { exportHtml } = await import('./html.js');
      const node: GraphNode = { id: 'node1', label: 'Line1\rLine2', type: 'concept' };
      const graph: GraphDocument = { nodes: [node], edges: [] };

      await exportHtml(graph, '/tmp/test.html');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('\\r');
    });

    it('should escape single quotes', async () => {
      const { exportHtml } = await import('./html.js');
      const node: GraphNode = { id: 'node1', label: "It's fine", type: 'concept' };
      const graph: GraphDocument = { nodes: [node], edges: [] };

      await exportHtml(graph, '/tmp/test.html');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain("\\'");
    });
  });

  describe('exportGraphHtml', () => {
    it('should export to default output path', async () => {
      const { exportGraphHtml } = await import('./html.js');
      const graph: GraphDocument = { nodes: [], edges: [] };

      const outputPath = await exportGraphHtml(graph);

      expect(outputPath).toContain('graphwiki-out/exports');
      expect(outputPath).toMatch(/graph\.html$/);
    });

    it('should use custom output directory', async () => {
      const { exportGraphHtml } = await import('./html.js');
      const graph: GraphDocument = { nodes: [], edges: [] };

      const outputPath = await exportGraphHtml(graph, 'custom/output');

      expect(outputPath).toContain('custom/output');
    });
  });

  describe('node type colors', () => {
    it('should include color mapping for node types', async () => {
      const { exportHtml } = await import('./html.js');
      const node: GraphNode = { id: 'node1', label: 'Test', type: 'function' };
      const graph: GraphDocument = { nodes: [node], edges: [] };

      await exportHtml(graph, '/tmp/test.html');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('typeColors');
      expect(writtenContent).toContain('function');
      expect(writtenContent).toContain('e94560');
    });
  });
});
