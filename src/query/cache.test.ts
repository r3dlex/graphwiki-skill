import { describe, it, expect, beforeEach } from 'vitest';
import { QueryCache } from './cache.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, existsSync } from 'fs';

describe('QueryCache', () => {
  const tempCacheDir = join(tmpdir(), 'graphwiki-cache-test-' + Date.now());
  let cache: QueryCache;

  beforeEach(() => {
    try {
      rmSync(tempCacheDir, { recursive: true });
    } catch {
      // ignore
    }
    cache = new QueryCache(tempCacheDir, 168);
  });

  describe('get/set', () => {
    it('should store and retrieve a query result', async () => {
      const question = 'What is AI?';
      const result: import('./types.js').QueryResult = {
        answer: 'AI stands for Artificial Intelligence.',
        tier_reached: 1,
        tokens_consumed: 150,
        pages_loaded: ['report.md'],
        nodes_traversed: ['n1'],
      };

      await cache.set(question, result);
      const retrieved = await cache.get(question);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.answer).toBe('AI stands for Artificial Intelligence.');
      expect(retrieved!.tier_reached).toBe(1);
    });

    it('should return null for unknown question', async () => {
      const result = await cache.get('Never asked this question');

      expect(result).toBeNull();
    });

    it('should be case-insensitive for questions', async () => {
      const result: import('./types.js').QueryResult = {
        answer: 'Test answer.',
        tier_reached: 0,
        tokens_consumed: 0,
        pages_loaded: [],
        nodes_traversed: [],
      };

      await cache.set('What is Python?', result);
      const retrieved = await cache.get('what is python?');

      expect(retrieved).not.toBeNull();
    });
  });

  describe('invalidate', () => {
    it('should invalidate queries that traversed specific nodes', async () => {
      const result1: import('./types.js').QueryResult = {
        answer: 'Answer 1',
        tier_reached: 3,
        tokens_consumed: 100,
        pages_loaded: [],
        nodes_traversed: ['n1', 'n2'],
      };
      const result2: import('./types.js').QueryResult = {
        answer: 'Answer 2',
        tier_reached: 3,
        tokens_consumed: 200,
        pages_loaded: [],
        nodes_traversed: ['n3'],
      };

      await cache.set('Question about n1 and n2', result1);
      await cache.set('Question about n3', result2);

      await cache.invalidate(['n1']);

      expect(await cache.get('Question about n1 and n2')).toBeNull();
      expect(await cache.get('Question about n3')).not.toBeNull();
    });

    it('should invalidate multiple nodes at once', async () => {
      const result: import('./types.js').QueryResult = {
        answer: 'Answer',
        tier_reached: 2,
        tokens_consumed: 50,
        pages_loaded: [],
        nodes_traversed: ['n1', 'n2', 'n3'],
      };

      await cache.set('Question', result);
      await cache.invalidate(['n1', 'n2', 'n3']);

      expect(await cache.get('Question')).toBeNull();
    });
  });

  describe('TTL', () => {
    it('should store and retrieve entries', async () => {
      const ttlCache = new QueryCache(tempCacheDir + '-ttl', 168);
      const result: import('./types.js').QueryResult = {
        answer: 'TTL test',
        tier_reached: 0,
        tokens_consumed: 0,
        pages_loaded: [],
        nodes_traversed: [],
      };

      await ttlCache.set('TTL question', result);
      const stored = await ttlCache.get('TTL question');
      expect(stored).not.toBeNull();
      expect(stored!.answer).toBe('TTL test');
    });

    it('should invalidate entries for specific nodes', async () => {
      const cache2 = new QueryCache(tempCacheDir + '-invalidate', 168);
      const result: import('./types.js').QueryResult = {
        answer: 'Test answer',
        tier_reached: 2,
        tokens_consumed: 100,
        pages_loaded: [],
        nodes_traversed: ['n1', 'n2'],
      };

      await cache2.set('Question about n1 and n2', result);
      const before = await cache2.get('Question about n1 and n2');
      expect(before).not.toBeNull();

      await cache2.invalidate(['n1']);
      const after = await cache2.get('Question about n1 and n2');
      expect(after).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all entries', async () => {
      const result: import('./types.js').QueryResult = {
        answer: 'Test',
        tier_reached: 0,
        tokens_consumed: 0,
        pages_loaded: [],
        nodes_traversed: [],
      };

      await cache.set('Q1', result);
      await cache.set('Q2', result);

      await cache.clear();

      expect(await cache.get('Q1')).toBeNull();
      expect(await cache.get('Q2')).toBeNull();
    });
  });

  describe('persistence', () => {
    it('should persist cache across instances', async () => {
      const result: import('./types.js').QueryResult = {
        answer: 'Persisted answer',
        tier_reached: 1,
        tokens_consumed: 100,
        pages_loaded: [],
        nodes_traversed: ['x1'],
      };

      await cache.set('Persisted question', result);

      // Create new instance with same cache dir
      const cache2 = new QueryCache(tempCacheDir);
      const retrieved = await cache2.get('Persisted question');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.answer).toBe('Persisted answer');
    });
  });
});
