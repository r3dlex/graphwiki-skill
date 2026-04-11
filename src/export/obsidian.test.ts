import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GraphDocument } from '../types.js';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

describe('obsidian export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('exportObsidian', () => {
    it('should create vault directory structure', async () => {
      const { exportObsidian } = await import('./obsidian.js');

      const graph: GraphDocument = {
        nodes: [{ id: 'n1', label: 'AI', type: 'concept' }],
        edges: [],
      };

      await exportObsidian(graph, '/tmp/vault');

      const { mkdir } = vi.mocked(await import('fs/promises'));
      expect(mkdir).toHaveBeenCalledWith('/tmp/vault/nodes', { recursive: true });
      expect(mkdir).toHaveBeenCalledWith('/tmp/vault/graphs', { recursive: true });
    });

    it('should export each node as a note', async () => {
      const { exportObsidian } = await import('./obsidian.js');

      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'AI', type: 'concept' },
          { id: 'n2', label: 'ML', type: 'concept' },
        ],
        edges: [],
      };

      await exportObsidian(graph, '/tmp/vault');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      expect(writeFile).toHaveBeenCalled();
      expect(writeFile.mock.calls.length).toBeGreaterThanOrEqual(3); // nodes + canvas + index
    });
  });

  describe('generateNoteContent', () => {
    it('should generate frontmatter with id, type, and label', async () => {
      const { exportObsidian } = await import('./obsidian.js');

      const graph: GraphDocument = {
        nodes: [{ id: 'n1', label: 'Neural Network', type: 'model' }],
        edges: [],
      };

      await exportObsidian(graph, '/tmp/vault');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const calls = writeFile.mock.calls.filter(c => (c[0] as string).includes('nodes'));
      const content = calls[0]![1] as string;

      expect(content).toContain('---');
      expect(content).toContain('id: n1');
      expect(content).toContain('type: model');
      expect(content).toContain('label: Neural Network');
    });

    it('should include community in frontmatter when defined', async () => {
      const { exportObsidian } = await import('./obsidian.js');

      const graph: GraphDocument = {
        nodes: [{ id: 'n1', label: 'AI', type: 'concept', community: 42 }],
        edges: [],
      };

      await exportObsidian(graph, '/tmp/vault');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const calls = writeFile.mock.calls.filter(c => (c[0] as string).includes('nodes'));
      const content = calls[0]![1] as string;

      expect(content).toContain('community: 42');
    });

    it('should include provenance in frontmatter', async () => {
      const { exportObsidian } = await import('./obsidian.js');

      const graph: GraphDocument = {
        nodes: [{ id: 'n1', label: 'AI', type: 'concept', provenance: ['source1.md'] }],
        edges: [],
      };

      await exportObsidian(graph, '/tmp/vault');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const calls = writeFile.mock.calls.filter(c => (c[0] as string).includes('nodes'));
      const content = calls[0]![1] as string;

      expect(content).toContain('provenance:');
      expect(content).toContain('source1.md');
    });

    it('should list outgoing edges as Calls / References', async () => {
      const { exportObsidian } = await import('./obsidian.js');

      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'AI', type: 'concept' },
          { id: 'n2', label: 'ML', type: 'concept' },
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2', label: 'includes', weight: 1 }],
      };

      await exportObsidian(graph, '/tmp/vault');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const calls = writeFile.mock.calls.filter(c => (c[0] as string).includes('nodes'));
      const content = calls[0]![1] as string;

      expect(content).toContain('## Calls / References');
      expect(content).toContain('[[ML]]');
    });

    it('should list incoming edges as Called By / Referenced By', async () => {
      const { exportObsidian } = await import('./obsidian.js');

      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'AI', type: 'concept' },
          { id: 'n2', label: 'ML', type: 'concept' },
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2', weight: 1 }],
      };

      await exportObsidian(graph, '/tmp/vault');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const calls = writeFile.mock.calls.filter(c => (c[0] as string).includes('nodes'));
      // n2's content should have "Called By"
      const content = calls.find(c => (c[0] as string).includes('nodes/ML'))?.[1] as string;

      expect(content).toContain('## Called By / Referenced By');
      expect(content).toContain('[[AI]]');
    });

    it('should list properties section', async () => {
      const { exportObsidian } = await import('./obsidian.js');

      const graph: GraphDocument = {
        nodes: [
          {
            id: 'n1',
            label: 'AI',
            type: 'concept',
            properties: { accuracy: 0.95, trained: true },
          },
        ],
        edges: [],
      };

      await exportObsidian(graph, '/tmp/vault');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const calls = writeFile.mock.calls.filter(c => (c[0] as string).includes('nodes'));
      const content = calls[0]![1] as string;

      expect(content).toContain('## Properties');
      expect(content).toContain('accuracy');
    });

    it('should list source file', async () => {
      const { exportObsidian } = await import('./obsidian.js');

      const graph: GraphDocument = {
        nodes: [{ id: 'n1', label: 'AI', type: 'concept', source_file: '/path/to/file.md' }],
        edges: [],
      };

      await exportObsidian(graph, '/tmp/vault');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const calls = writeFile.mock.calls.filter(c => (c[0] as string).includes('nodes'));
      const content = calls[0]![1] as string;

      expect(content).toContain('## Source');
      expect(content).toContain('/path/to/file.md');
    });

    it('should list community members', async () => {
      const { exportObsidian } = await import('./obsidian.js');

      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'AI', type: 'concept', community: 1 },
          { id: 'n2', label: 'ML', type: 'concept', community: 1 },
          { id: 'n3', label: 'DL', type: 'concept', community: 2 },
        ],
        edges: [],
      };

      await exportObsidian(graph, '/tmp/vault');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const calls = writeFile.mock.calls.filter(c => (c[0] as string).includes('nodes'));
      const content = calls[0]![1] as string;

      expect(content).toContain('## Community');
      // Should reference other nodes in same community
    });
  });

  describe('generateGraphCanvas', () => {
    it('should generate graph.canvas JSON', async () => {
      const { exportObsidian } = await import('./obsidian.js');

      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'AI', type: 'concept' },
          { id: 'n2', label: 'ML', type: 'concept' },
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2', weight: 1 }],
      };

      await exportObsidian(graph, '/tmp/vault');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const canvasCall = writeFile.mock.calls.find(c => (c[0] as string).includes('graph.canvas'));
      expect(canvasCall).toBeDefined();

      const content = canvasCall![1] as string;
      const parsed = JSON.parse(content);
      expect(parsed.nodes).toBeDefined();
      expect(parsed.edges).toBeDefined();
    });

    it('should position nodes in grid layout', async () => {
      const { exportObsidian } = await import('./obsidian.js');

      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'AI', type: 'concept' },
          { id: 'n2', label: 'ML', type: 'concept' },
          { id: 'n3', label: 'DL', type: 'concept' },
        ],
        edges: [],
      };

      await exportObsidian(graph, '/tmp/vault');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const canvasCall = writeFile.mock.calls.find(c => (c[0] as string).includes('graph.canvas'));
      const content = canvasCall![1] as string;
      const parsed = JSON.parse(content);

      expect(parsed.nodes[0].x).toBeDefined();
      expect(parsed.nodes[0].y).toBeDefined();
    });
  });

  describe('exportIndex', () => {
    it('should generate index with statistics', async () => {
      const { exportObsidian } = await import('./obsidian.js');

      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'AI', type: 'concept' },
          { id: 'n2', label: 'ML', type: 'concept' },
          { id: 'n3', label: 'DL', type: 'model' },
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2', weight: 1 }],
      };

      await exportObsidian(graph, '/tmp/vault');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const indexCall = writeFile.mock.calls.find(c => (c[0] as string).includes('index.md'));
      expect(indexCall).toBeDefined();

      const content = indexCall![1] as string;
      expect(content).toContain('# GraphWiki Index');
      expect(content).toContain('Nodes: 3');
      expect(content).toContain('Edges: 1');
    });

    it('should group nodes by type', async () => {
      const { exportObsidian } = await import('./obsidian.js');

      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'AI', type: 'concept' },
          { id: 'n2', label: 'ML', type: 'concept' },
          { id: 'n3', label: 'BERT', type: 'model' },
        ],
        edges: [],
      };

      await exportObsidian(graph, '/tmp/vault');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const indexCall = writeFile.mock.calls.find(c => (c[0] as string).includes('index.md'));
      const content = indexCall![1] as string;

      expect(content).toContain('## By Type');
      expect(content).toContain('### concept (2)');
      expect(content).toContain('### model (1)');
    });

    it('should group nodes by community', async () => {
      const { exportObsidian } = await import('./obsidian.js');

      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'AI', type: 'concept', community: 1 },
          { id: 'n2', label: 'ML', type: 'concept', community: 1 },
          { id: 'n3', label: 'DL', type: 'concept', community: 2 },
        ],
        edges: [],
      };

      await exportObsidian(graph, '/tmp/vault');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const indexCall = writeFile.mock.calls.find(c => (c[0] as string).includes('index.md'));
      const content = indexCall![1] as string;

      expect(content).toContain('## By Community');
      expect(content).toContain('### Community 1 (2)');
      expect(content).toContain('### Community 2 (1)');
    });

    it('should limit nodes shown per type to 20', async () => {
      const { exportObsidian } = await import('./obsidian.js');

      const nodes = Array.from({ length: 25 }, (_, i) => ({
        id: `n${i}`,
        label: `Node${i}`,
        type: 'concept' as const,
      }));

      const graph: GraphDocument = {
        nodes,
        edges: [],
      };

      await exportObsidian(graph, '/tmp/vault');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const indexCall = writeFile.mock.calls.find(c => (c[0] as string).includes('index.md'));
      const content = indexCall![1] as string;

      expect(content).toContain('... and 5 more');
    });
  });

  describe('sanitizeFilename', () => {
    it('should remove invalid filename characters', async () => {
      const { exportObsidian } = await import('./obsidian.js');

      const graph: GraphDocument = {
        nodes: [{ id: 'n1', label: 'File <Name> With "Quotes"', type: 'concept' }],
        edges: [],
      };

      await exportObsidian(graph, '/tmp/vault');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const calls = writeFile.mock.calls.filter(c => (c[0] as string).includes('nodes'));
      const filename = calls[0]![0] as string;

      expect(filename).not.toContain('<');
      expect(filename).not.toContain('>');
      expect(filename).not.toContain('"');
    });

    it('should trim whitespace and limit length', async () => {
      const { exportObsidian } = await import('./obsidian.js');

      const longName = 'A'.repeat(150);
      const graph: GraphDocument = {
        nodes: [{ id: 'n1', label: longName, type: 'concept' }],
        edges: [],
      };

      await exportObsidian(graph, '/tmp/vault');

      const { writeFile } = vi.mocked(await import('fs/promises'));
      const calls = writeFile.mock.calls.filter(c => (c[0] as string).includes('nodes'));
      const filename = calls[0]![0] as string;

      // Length should be limited (100 chars + .md extension)
      expect(filename.length).toBeLessThanOrEqual(120);
    });
  });

  describe('exportToObsidian', () => {
    it('should use default vault path', async () => {
      const { exportToObsidian } = await import('./obsidian.js');

      const graph: GraphDocument = {
        nodes: [{ id: 'n1', label: 'AI', type: 'concept' }],
        edges: [],
      };

      await exportToObsidian(graph);

      const { mkdir } = vi.mocked(await import('fs/promises'));
      expect(mkdir).toHaveBeenCalled();
    });

    it('should accept custom vault path', async () => {
      const { exportToObsidian } = await import('./obsidian.js');

      const graph: GraphDocument = {
        nodes: [{ id: 'n1', label: 'AI', type: 'concept' }],
        edges: [],
      };

      await exportToObsidian(graph, '/custom/vault/path');

      const { mkdir } = vi.mocked(await import('fs/promises'));
      expect(mkdir).toHaveBeenCalledWith('/custom/vault/path/nodes', { recursive: true });
    });
  });
});
