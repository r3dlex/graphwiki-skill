import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadHeldOutQueries,
  saveHeldOutQueries,
  hasHeldOutQueries,
  createDefaultHeldOutQueries,
  type HeldOutQuery,
} from './held-queries.js';

vi.mock('fs/promises');
vi.mock('writeFile' as any);

describe('held-queries', () => {
  const tempDir = join(tmpdir(), 'graphwiki-held-queries-test-' + Date.now());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('loadHeldOutQueries', () => {
    it('should load queries from a JSON array', async () => {
      const queries: HeldOutQuery[] = [
        { query: 'test query 1', category: 'test' },
        { query: 'test query 2', expectedTier: 2 },
      ];
      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify(queries));

      const result = await loadHeldOutQueries(tempDir);

      expect(result).toEqual(queries);
      expect(readFile).toHaveBeenCalledWith(tempDir, 'utf-8');
    });

    it('should load queries from wrapped object format', async () => {
      const queries = {
        queries: [
          { query: 'test query 1', category: 'test' },
          { query: 'test query 2', expectedTier: 2 },
        ],
      };
      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify(queries));

      const result = await loadHeldOutQueries(tempDir);

      expect(result).toHaveLength(2);
      expect(result[0]!.query).toBe('test query 1');
    });

    it('should return empty array if file does not exist', async () => {
      (readFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ENOENT'));

      const result = await loadHeldOutQueries(tempDir);

      expect(result).toEqual([]);
    });

    it('should return empty array for other file errors', async () => {
      (readFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('EACCES'));

      const result = await loadHeldOutQueries(tempDir);

      expect(result).toEqual([]);
    });

    it('should handle malformed JSON gracefully', async () => {
      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue('not valid json');

      const result = await loadHeldOutQueries(tempDir);

      expect(result).toEqual([]);
    });

    it('should handle empty file content', async () => {
      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue('');

      const result = await loadHeldOutQueries(tempDir);

      expect(result).toEqual([]);
    });
  });

  describe('saveHeldOutQueries', () => {
    it('should save queries wrapped in object format', async () => {
      const queries: HeldOutQuery[] = [
        { query: 'test query 1', category: 'test' },
        { query: 'test query 2', expectedTier: 2 },
      ];
      (mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await saveHeldOutQueries(queries, tempDir);

      expect(mkdir).toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalledWith(
        tempDir,
        JSON.stringify({ queries }, null, 2),
        'utf-8'
      );
    });

    it('should create directory recursively', async () => {
      const queries: HeldOutQuery[] = [{ query: 'test' }];
      (mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await saveHeldOutQueries(queries, tempDir);

      expect(mkdir).toHaveBeenCalledWith(tempDir.substring(0, tempDir.lastIndexOf('/')), { recursive: true });
    });

    it('should not call mkdir if path has no slash', async () => {
      const queries: HeldOutQuery[] = [{ query: 'test' }];
      (writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await saveHeldOutQueries(queries, 'held-out-queries.json');

      // mkdir should not be called because dir is empty string (falsy)
      expect(mkdir).not.toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalled();
    });

    it('should handle empty queries array', async () => {
      const queries: HeldOutQuery[] = [];
      (mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await saveHeldOutQueries(queries, tempDir);

      expect(writeFile).toHaveBeenCalledWith(
        tempDir,
        JSON.stringify({ queries: [] }, null, 2),
        'utf-8'
      );
    });
  });

  describe('hasHeldOutQueries', () => {
    it('should return true when file exists', async () => {
      (access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await hasHeldOutQueries(tempDir);

      expect(result).toBe(true);
      expect(access).toHaveBeenCalledWith(tempDir);
    });

    it('should return false when file does not exist', async () => {
      (access as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ENOENT'));

      const result = await hasHeldOutQueries(tempDir);

      expect(result).toBe(false);
    });

    it('should return false on other errors', async () => {
      (access as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('EACCES'));

      const result = await hasHeldOutQueries(tempDir);

      expect(result).toBe(false);
    });
  });

  describe('createDefaultHeldOutQueries', () => {
    it('should call saveHeldOutQueries with 20 queries', async () => {
      // The function creates 20 default queries and calls saveHeldOutQueries
      // We verify by checking the function runs without error
      (mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await createDefaultHeldOutQueries(tempDir);

      // Verify writeFile was called (via saveHeldOutQueries)
      expect(writeFile).toHaveBeenCalled();
    });

    it('should save queries with expected structure', async () => {
      (mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await createDefaultHeldOutQueries(tempDir);

      const savedContent = (writeFile as any).mock.calls[0][1] as string;
      const savedData = JSON.parse(savedContent);
      expect(savedData.queries).toBeInstanceOf(Array);
      expect(savedData.queries.length).toBe(20);
    });

    it('should create queries with all expected categories', async () => {
      (mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await createDefaultHeldOutQueries(tempDir);

      const savedContent = (writeFile as any).mock.calls[0][1] as string;
      const savedData = JSON.parse(savedContent);
      const categories = savedData.queries.map((q: HeldOutQuery) => q.category);

      expect(categories).toContain('extraction');
      expect(categories).toContain('dedup');
      expect(categories).toContain('query');
      expect(categories).toContain('community');
    });
  });
});
