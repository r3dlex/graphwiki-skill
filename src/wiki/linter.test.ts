import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WikiLinter } from './linter.js';
import type { GraphDocument } from '../types.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync } from 'fs';

describe('WikiLinter', () => {
  const tempDir = join(tmpdir(), 'graphwiki-linter-test-' + Date.now());

  beforeEach(() => {
    mkdirSync(join(tempDir, 'wiki'), { recursive: true });
  });

  describe('detectContradictions', () => {
    it('should detect contradictions between wiki content and graph edges', () => {
      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'Node A', type: 'concept', community: 1 },
          { id: 'n2', label: 'Node B', type: 'concept', community: 1 },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2', weight: 1, label: 'contradicts' },
        ],
      };
      const linter = new WikiLinter(graph, tempDir);

      const pages = [
        {
          path: 'wiki/n1.md',
          frontmatter: { label: 'Node A', node_id: 'n1' },
          content: 'Node A mentions Node B as related.',
        },
        {
          path: 'wiki/n2.md',
          frontmatter: { label: 'Node B', node_id: 'n2' },
          content: 'Node B is a concept.',
        },
      ];

      const contradictions = linter.detectContradictions(pages);

      expect(contradictions.length).toBeGreaterThan(0);
      expect(contradictions[0].node_id).toBe('n1');
      expect(contradictions[0].edge_label).toBe('contradicts');
    });

    it('should return empty when no contradictions exist', () => {
      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'Node A', type: 'concept' },
          { id: 'n2', label: 'Node B', type: 'concept' },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2', weight: 1, label: 'relates' },
        ],
      };
      const linter = new WikiLinter(graph, tempDir);

      const pages = [
        {
          path: 'wiki/n1.md',
          frontmatter: { label: 'Node A', node_id: 'n1' },
          content: 'Node A is unrelated to Node B.',
        },
        {
          path: 'wiki/n2.md',
          frontmatter: { label: 'Node B', node_id: 'n2' },
          content: 'Node B is a concept.',
        },
      ];

      const contradictions = linter.detectContradictions(pages);

      expect(contradictions.length).toBe(0);
    });
  });

  describe('checkCompleteness', () => {
    it('should report nodes without provenance when completeness is partial', () => {
      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'Node A', type: 'concept', provenance: ['source1'] },
          { id: 'n2', label: 'Node B', type: 'concept' },
        ],
        edges: [],
        metadata: { completeness: 0.5 },
      };
      const linter = new WikiLinter(graph, tempDir);

      const missing = linter.checkCompleteness();

      expect(missing.some((m) => m.node_id === 'n2')).toBe(true);
    });

    it('should not report missing sources when completeness is full', () => {
      const graph: GraphDocument = {
        nodes: [
          { id: 'n1', label: 'Node A', type: 'concept' },
        ],
        edges: [],
        metadata: { completeness: 1.0 },
      };
      const linter = new WikiLinter(graph, tempDir);

      const missing = linter.checkCompleteness();

      expect(missing.length).toBe(0);
    });
  });

  describe('checkWikiLinks', () => {
    it('should detect broken wiki links', async () => {
      writeFileSync(
        join(tempDir, 'wiki', 'page1.md'),
        `---
label: Page 1
---
Content with [[nonexistent|Link Text]] and [[also-doesnt-exist]].
`,
        'utf-8',
      );

      const graph: GraphDocument = { nodes: [], edges: [] };
      const linter = new WikiLinter(graph, tempDir);

      const broken = await linter.checkWikiLinks();

      expect(broken.length).toBe(2);
    });

    it('should not report valid wiki links', async () => {
      writeFileSync(
        join(tempDir, 'wiki', 'page1.md'),
        `---
label: Page 1
---
Content with [[valid-page]].
`,
        'utf-8',
      );
      writeFileSync(
        join(tempDir, 'wiki', 'valid-page.md'),
        `---
label: Valid Page
---
Content of valid page.
`,
        'utf-8',
      );

      const graph: GraphDocument = { nodes: [], edges: [] };
      const linter = new WikiLinter(graph, tempDir);

      const broken = await linter.checkWikiLinks();

      expect(broken.length).toBe(0);
    });
  });

  describe('lint', () => {
    it('should return valid=true when no issues found', async () => {
      const graph: GraphDocument = {
        nodes: [{ id: 'n1', label: 'Node A', type: 'concept', provenance: ['src'] }],
        edges: [{ id: 'e1', source: 'n1', target: 'n1', weight: 1, label: 'self' }],
        metadata: { completeness: 1.0 },
      };
      const linter = new WikiLinter(graph, tempDir);

      const result = await linter.lint();

      expect(result.valid).toBe(true);
      expect(result.broken_links.length).toBe(0);
    });
  });
});
