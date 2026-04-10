import { describe, it, expect, beforeEach } from 'vitest';
import { WikiGraphMap } from './wiki-graph-map.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

describe('WikiGraphMap', () => {
  const tempPath = join(tmpdir(), 'test-wiki-graph-map.json');

  beforeEach(() => {
    try {
      rmSync(tempPath);
    } catch {
      // ignore
    }
  });

  describe('addMapping', () => {
    it('should add a bidirectional mapping', () => {
      const map = new WikiGraphMap(tempPath);
      map.addMapping('n1', 'wiki/node-a.md');

      expect(map.getPageForNode('n1')).toBe('wiki/node-a.md');
      expect(map.getNodesForPage('wiki/node-a.md')).toContain('n1');
    });

    it('should not duplicate node in page mapping', () => {
      const map = new WikiGraphMap(tempPath);
      map.addMapping('n1', 'wiki/page.md');
      map.addMapping('n1', 'wiki/page.md');

      const nodes = map.getNodesForPage('wiki/page.md');
      expect(nodes.filter((n) => n === 'n1').length).toBe(1);
    });
  });

  describe('removeMapping', () => {
    it('should remove a mapping', () => {
      const map = new WikiGraphMap(tempPath);
      map.addMapping('n1', 'wiki/node-a.md');
      map.removeMapping('n1');

      expect(map.getPageForNode('n1')).toBeNull();
    });

    it('should remove node from page list but keep other nodes', () => {
      const map = new WikiGraphMap(tempPath);
      map.addMapping('n1', 'wiki/page.md');
      map.addMapping('n2', 'wiki/page.md');
      map.removeMapping('n1');

      expect(map.getNodesForPage('wiki/page.md')).not.toContain('n1');
      expect(map.getNodesForPage('wiki/page.md')).toContain('n2');
    });
  });

  describe('getAllMappings', () => {
    it('should return all node-to-page mappings', () => {
      const map = new WikiGraphMap(tempPath);
      map.addMapping('n1', 'wiki/a.md');
      map.addMapping('n2', 'wiki/b.md');

      const all = map.getAllMappings();
      expect(all.n1).toBe('wiki/a.md');
      expect(all.n2).toBe('wiki/b.md');
    });

    it('should return a copy, not the original', () => {
      const map = new WikiGraphMap(tempPath);
      map.addMapping('n1', 'wiki/a.md');

      const all = map.getAllMappings();
      delete all.n1;

      const fresh = map.getAllMappings();
      expect(fresh.n1).toBe('wiki/a.md');
    });
  });

  describe('persistence', () => {
    it('should persist mappings across instances', () => {
      {
        const map = new WikiGraphMap(tempPath);
        map.addMapping('n1', 'wiki/page-a.md');
        map.addMapping('n2', 'wiki/page-b.md');
      }

      {
        const map2 = new WikiGraphMap(tempPath);
        expect(map2.getPageForNode('n1')).toBe('wiki/page-a.md');
        expect(map2.getPageForNode('n2')).toBe('wiki/page-b.md');
        expect(map2.getNodesForPage('wiki/page-a.md')).toContain('n1');
      }
    });
  });
});
