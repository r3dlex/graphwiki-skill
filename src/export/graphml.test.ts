// Tests for graphml.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { writeFile } from 'fs/promises';
import type { GraphDocument, GraphNode, GraphEdge } from '../types.js';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

describe('graphml', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateGraphML', () => {
    it('should generate valid GraphML header', async () => {
      const { exportGraphML } = await import('./graphml.js');
      const graph: GraphDocument = { nodes: [], edges: [] };

      await exportGraphML(graph, '/tmp/test.graphml');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(writtenContent).toContain('xmlns="http://graphml.graphdrawing.org/xmlns"');
    });

    it('should define node attributes', async () => {
      const { exportGraphML } = await import('./graphml.js');
      const graph: GraphDocument = { nodes: [], edges: [] };

      await exportGraphML(graph, '/tmp/test.graphml');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('key id="label"');
      expect(writtenContent).toContain('key id="type"');
      expect(writtenContent).toContain('key id="community"');
      expect(writtenContent).toContain('key id="source_file"');
      expect(writtenContent).toContain('key id="provenance"');
    });

    it('should define edge attributes', async () => {
      const { exportGraphML } = await import('./graphml.js');
      const graph: GraphDocument = { nodes: [], edges: [] };

      await exportGraphML(graph, '/tmp/test.graphml');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('key id="weight"');
      expect(writtenContent).toContain('key id="edge_label"');
      expect(writtenContent).toContain('key id="edge_provenance"');
    });

    it('should include node count and edge count in graph tag', async () => {
      const { exportGraphML } = await import('./graphml.js');
      const graph: GraphDocument = {
        nodes: [{ id: 'n1', label: 'Node 1', type: 'concept' }, { id: 'n2', label: 'Node 2', type: 'concept' }],
        edges: [{ id: 'e1', source: 'n1', target: 'n2', weight: 1 }],
      };

      await exportGraphML(graph, '/tmp/test.graphml');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('nodes="2"');
      expect(writtenContent).toContain('edges="1"');
    });

    it('should serialize nodes with all attributes', async () => {
      const { exportGraphML } = await import('./graphml.js');
      const node: GraphNode = {
        id: 'node1',
        label: 'Test Node',
        type: 'function',
        community: 5,
        source_file: '/src/test.ts',
        provenance: ['test:2024-01-01'],
      };
      const graph: GraphDocument = { nodes: [node], edges: [] };

      await exportGraphML(graph, '/tmp/test.graphml');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('id="node1"');
      expect(writtenContent).toContain('<data key="label">Test Node</data>');
      expect(writtenContent).toContain('<data key="type">function</data>');
      expect(writtenContent).toContain('<data key="community">5</data>');
      expect(writtenContent).toContain('<data key="source_file">/src/test.ts</data>');
    });

    it('should serialize edges with all attributes', async () => {
      const { exportGraphML } = await import('./graphml.js');
      const edge: GraphEdge = {
        id: 'edge1',
        source: 'node1',
        target: 'node2',
        weight: 0.5,
        label: 'calls',
        provenance: ['test'],
      };
      const graph: GraphDocument = {
        nodes: [{ id: 'node1', label: 'N1', type: 'concept' }, { id: 'node2', label: 'N2', type: 'concept' }],
        edges: [edge],
      };

      await exportGraphML(graph, '/tmp/test.graphml');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('id="edge1"');
      expect(writtenContent).toContain('source="node1"');
      expect(writtenContent).toContain('target="node2"');
      expect(writtenContent).toContain('<data key="weight">0.5</data>');
      expect(writtenContent).toContain('<data key="edge_label">calls</data>');
    });

    it('should handle optional node attributes gracefully', async () => {
      const { exportGraphML } = await import('./graphml.js');
      const node: GraphNode = { id: 'node1', label: 'Minimal Node', type: 'concept' };
      const graph: GraphDocument = { nodes: [node], edges: [] };

      await exportGraphML(graph, '/tmp/test.graphml');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('id="node1"');
      // Should not have empty community or source_file tags
      expect(writtenContent).not.toContain('<data key="community"></data>');
    });
  });

  describe('XML escaping', () => {
    it('should escape ampersands', async () => {
      const { exportGraphML } = await import('./graphml.js');
      const node: GraphNode = { id: 'node1', label: 'A & B', type: 'concept' };
      const graph: GraphDocument = { nodes: [node], edges: [] };

      await exportGraphML(graph, '/tmp/test.graphml');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('&amp;');
    });

    it('should escape less-than signs', async () => {
      const { exportGraphML } = await import('./graphml.js');
      const node: GraphNode = { id: 'node1', label: 'A < B', type: 'concept' };
      const graph: GraphDocument = { nodes: [node], edges: [] };

      await exportGraphML(graph, '/tmp/test.graphml');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('&lt;');
    });

    it('should escape greater-than signs', async () => {
      const { exportGraphML } = await import('./graphml.js');
      const node: GraphNode = { id: 'node1', label: 'A > B', type: 'concept' };
      const graph: GraphDocument = { nodes: [node], edges: [] };

      await exportGraphML(graph, '/tmp/test.graphml');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('&gt;');
    });

    it('should escape quotes', async () => {
      const { exportGraphML } = await import('./graphml.js');
      const node: GraphNode = { id: 'node1', label: 'Say "Hello"', type: 'concept' };
      const graph: GraphDocument = { nodes: [node], edges: [] };

      await exportGraphML(graph, '/tmp/test.graphml');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('&quot;');
    });

    it('should escape apostrophes', async () => {
      const { exportGraphML } = await import('./graphml.js');
      const node: GraphNode = { id: 'node1', label: "It's fine", type: 'concept' };
      const graph: GraphDocument = { nodes: [node], edges: [] };

      await exportGraphML(graph, '/tmp/test.graphml');

      const writtenContent = vi.mocked(writeFile).mock.calls[0]![1] as string;
      expect(writtenContent).toContain('&apos;');
    });
  });

  describe('exportToGraphML', () => {
    it('should export to default output path', async () => {
      const { exportToGraphML } = await import('./graphml.js');
      const graph: GraphDocument = { nodes: [], edges: [] };

      const outputPath = await exportToGraphML(graph);

      expect(outputPath).toContain('graphwiki-out/exports');
      expect(outputPath).toMatch(/graph\.graphml$/);
    });

    it('should use custom output directory', async () => {
      const { exportToGraphML } = await import('./graphml.js');
      const graph: GraphDocument = { nodes: [], edges: [] };

      const outputPath = await exportToGraphML(graph, 'custom/output');

      expect(outputPath).toContain('custom/output');
    });
  });
});
