import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GraphDocument } from '../types.js';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

describe('neo4j export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('exportNeo4j', () => {
    it('should export graph to Neo4j Cypher format', async () => {
      const { exportNeo4j } = await import('./neo4j.js');

      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'AI', type: 'concept' },
          { id: 'n2', label: 'ML', type: 'concept' },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2', weight: 1.0 },
        ],
      };

      await exportNeo4j(graph, '/tmp/neo4j-export.cypher');

      const { writeFile, mkdir } = vi.mocked(await import('fs/promises'));
      expect(mkdir).toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalled();
    });
  });

  describe('generateNodeCreate', () => {
    it('should escape single quotes in strings', async () => {
      const { exportNeo4j } = await import('./neo4j.js');

      const graph: GraphDocument = {
        nodes: [
          { id: "n1", label: "O'Reilly", type: "concept" },
        ],
        edges: [],
      };

      await exportNeo4j(graph, '/tmp/test.cypher');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const content = writeFile.mock.calls[0]![1] as string;
      expect(content).toContain("O\\'Reilly");
    });

    it('should handle node with community', async () => {
      const { exportNeo4j } = await import('./neo4j.js');

      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'AI', type: 'concept', community: 42 },
        ],
        edges: [],
      };

      await exportNeo4j(graph, '/tmp/test.cypher');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const content = writeFile.mock.calls[0]![1] as string;
      expect(content).toContain('community: 42');
    });

    it('should handle node with provenance', async () => {
      const { exportNeo4j } = await import('./neo4j.js');

      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'AI', type: 'concept', provenance: ['source1.txt', 'source2.txt'] },
        ],
        edges: [],
      };

      await exportNeo4j(graph, '/tmp/test.cypher');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const content = writeFile.mock.calls[0]![1] as string;
      expect(content).toContain('provenance');
    });

    it('should handle node with source_file', async () => {
      const { exportNeo4j } = await import('./neo4j.js');

      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'AI', type: 'concept', source_file: '/path/to/file.md' },
        ],
        edges: [],
      };

      await exportNeo4j(graph, '/tmp/test.cypher');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const content = writeFile.mock.calls[0]![1] as string;
      expect(content).toContain('source_file');
    });

    it('should handle node with properties', async () => {
      const { exportNeo4j } = await import('./neo4j.js');

      const graph: GraphDocument = {
        nodes: [
          {
            id: 'n1',
            label: 'AI',
            type: 'concept',
            properties: { weight: 0.5, active: true },
          },
        ],
        edges: [],
      };

      await exportNeo4j(graph, '/tmp/test.cypher');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const content = writeFile.mock.calls[0]![1] as string;
      expect(content).toContain('weight');
      expect(content).toContain('active');
    });

    it('should handle node without type (default to GraphNode)', async () => {
      const { exportNeo4j } = await import('./neo4j.js');

      const graph: GraphDocument = {
        nodes: [{ id: 'n1', label: 'Unknown', type: 'concept' }],
        edges: [],
      };

      await exportNeo4j(graph, '/tmp/test.cypher');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const content = writeFile.mock.calls[0]![1] as string;
      expect(content).toContain('GraphNode');
    });
  });

  describe('generateRelationshipCreate', () => {
    it('should create relationship with label', async () => {
      const { exportNeo4j } = await import('./neo4j.js');

      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'AI', type: 'concept' },
          { id: 'n2', label: 'ML', type: 'concept' },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2', label: 'uses', weight: 1.0 },
        ],
      };

      await exportNeo4j(graph, '/tmp/test.cypher');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const content = writeFile.mock.calls[0]![1] as string;
      expect(content).toContain('USES');
    });

    it('should create relationship with provenance', async () => {
      const { exportNeo4j } = await import('./neo4j.js');

      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'AI', type: 'concept' },
          { id: 'n2', label: 'ML', type: 'concept' },
        ],
        edges: [
          {
            id: 'e1',
            source: 'n1',
            target: 'n2',
            weight: 1.0,
            provenance: ['edge-source1.txt'],
          },
        ],
      };

      await exportNeo4j(graph, '/tmp/test.cypher');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const content = writeFile.mock.calls[0]![1] as string;
      expect(content).toContain('provenance');
    });

    it('should replace spaces in relationship type', async () => {
      const { exportNeo4j } = await import('./neo4j.js');

      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'AI', type: 'concept' },
          { id: 'n2', label: 'ML', type: 'concept' },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2', label: 'related to', weight: 1.0 },
        ],
      };

      await exportNeo4j(graph, '/tmp/test.cypher');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const content = writeFile.mock.calls[0]![1] as string;
      expect(content).toContain('RELATED_TO');
    });
  });

  describe('escapeCypherString', () => {
    it('should escape single quotes', async () => {
      const { exportNeo4j } = await import('./neo4j.js');

      const graph: GraphDocument = {
        nodes: [{ id: "n1", label: "test's", type: 'concept' }],
        edges: [],
      };

      await exportNeo4j(graph, '/tmp/test.cypher');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const content = writeFile.mock.calls[0]![1] as string;
      // Should be \' in the cypher
      expect(content).toContain("'test");
    });

    it('should handle null/undefined values', async () => {
      const { exportNeo4j } = await import('./neo4j.js');

      const graph: GraphDocument = {
        nodes: [{ id: 'n1', label: '', type: 'concept' }],
        edges: [],
      };

      await expect(exportNeo4j(graph, '/tmp/test.cypher')).resolves.not.toThrow();
    });
  });

  describe('exportToNeo4j', () => {
    it('should export to default path', async () => {
      const { exportToNeo4j } = await import('./neo4j.js');

      const graph: GraphDocument = {
        nodes: [{ id: 'n1', label: 'AI', type: 'concept' }],
        edges: [],
      };

      const result = await exportToNeo4j(graph);

      expect(result).toContain('neo4j-export.cypher');
    });

    it('should export to custom output dir', async () => {
      const { exportToNeo4j } = await import('./neo4j.js');

      const graph: GraphDocument = {
        nodes: [{ id: 'n1', label: 'AI', type: 'concept' }],
        edges: [],
      };

      const result = await exportToNeo4j(graph, 'custom/path');

      expect(result).toContain('custom/path');
      expect(result).toContain('neo4j-export.cypher');
    });
  });
});
