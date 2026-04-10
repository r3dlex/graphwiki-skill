import { describe, it, expect } from 'vitest';
import { IndexGenerator } from './index-generator.js';
import type { GraphDocument, WikiPage } from './types.js';

describe('IndexGenerator', () => {
  describe('generate', () => {
    it('should generate a complete index page', async () => {
      const wikiPages: WikiPage[] = [
        {
          path: 'wiki/concepts/ai.md',
          frontmatter: { label: 'AI', type: 'concept' },
          content: 'Content about AI.',
        },
        {
          path: 'wiki/entities/bert.md',
          frontmatter: { label: 'BERT', type: 'entity' },
          content: 'Content about BERT [[wiki/concepts/ai.md]].',
        },
        {
          path: 'wiki/sources/paper.md',
          frontmatter: { label: 'Paper', type: 'source' },
          content: 'Source paper content.',
        },
      ];
      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'AI', type: 'concept', community: 1 },
          { id: 'n2', label: 'BERT', type: 'entity', community: 1 },
          { id: 'n3', label: 'Paper', type: 'source', community: 2 },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2', weight: 1 },
        ],
      };

      const generator = new IndexGenerator();
      const index = await generator.generate(wikiPages, graph);

      expect(index).toContain('# GraphWiki Index');
      expect(index).toContain('| Nodes | 3 |');
      expect(index).toContain('| Edges | 1 |');
      expect(index).toContain('## Concepts');
      expect(index).toContain('## Entities');
      expect(index).toContain('## Sources');
      expect(index).toContain('[[wiki/entities/bert.md]] — BERT');
    });

    it('should count cross-references in related links summary', async () => {
      const wikiPages: WikiPage[] = [
        {
          path: 'wiki/a.md',
          frontmatter: { label: 'A', type: 'concept' },
          content: 'See [[wiki/b.md]] for details.',
        },
        {
          path: 'wiki/b.md',
          frontmatter: { label: 'B', type: 'concept' },
          content: 'Referenced by [[wiki/a.md]].',
        },
      ];
      const graph: GraphDocument = { nodes: [], edges: [] };

      const generator = new IndexGenerator();
      const index = await generator.generate(wikiPages, graph);

      expect(index).toContain('Total cross-references: 2');
      expect(index).toContain('[[wiki/a.md]] → [[wiki/b.md]]');
    });

    it('should handle empty wiki pages', async () => {
      const graph: GraphDocument = { nodes: [], edges: [] };
      const generator = new IndexGenerator();
      const index = await generator.generate([], graph);

      expect(index).toContain('# GraphWiki Index');
      expect(index).toContain('| Nodes | 0 |');
      expect(index).toContain('No cross-references found');
    });

    it('should group pages by type', async () => {
      const pages: WikiPage[] = [
        { path: '1.md', frontmatter: { label: 'X', type: 'concept' }, content: '' },
        { path: '2.md', frontmatter: { label: 'Y', type: 'entity' }, content: '' },
        { path: '3.md', frontmatter: { label: 'Z', type: 'source' }, content: '' },
        { path: '4.md', frontmatter: { label: 'W', type: 'comparison' }, content: '' },
      ];
      const graph: GraphDocument = { nodes: [], edges: [] };

      const generator = new IndexGenerator();
      const index = await generator.generate(pages, graph);

      expect(index).toContain('### Concepts');
      expect(index).toContain('### Entities');
      expect(index).toContain('### Sources');
      expect(index).toContain('### Comparisons');
    });
  });
});
