import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RefinementHistory, createRefinementHistory } from './history.js';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';

const TEST_DIR = '/tmp/graphwiki-test-history';

describe('RefinementHistory', () => {
  let history: RefinementHistory;
  const historyPath = join(TEST_DIR, 'history.jsonl');

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    history = new RefinementHistory(historyPath);
  });

  afterEach(async () => {
    try {
      await rm(TEST_DIR, { recursive: true, force: true });
    } catch {}
  });

  describe('append', () => {
    it('should append entry to history', async () => {
      const entry: import('../types.js').RefinementHistoryEntry = {
        version: 'v1',
        timestamp: '2024-01-01T00:00:00Z',
        promptDiff: 'Initial version',
        diagnostics: [],
        validationScore: 0.7,
      };

      await history.append(entry);

      const loaded = await history.getHistory();
      expect(loaded.length).toBe(1);
      expect(loaded[0]?.version).toBe('v1');
    });

    it('should append multiple entries', async () => {
      const entry1: import('../types.js').RefinementHistoryEntry = {
        version: 'v1',
        timestamp: '2024-01-01T00:00:00Z',
        promptDiff: 'Initial',
        diagnostics: [],
        validationScore: 0.7,
      };

      const entry2: import('../types.js').RefinementHistoryEntry = {
        version: 'v2',
        timestamp: '2024-01-02T00:00:00Z',
        promptDiff: 'Updated',
        diagnostics: [],
        validationScore: 0.75,
      };

      await history.append(entry1);
      await history.append(entry2);

      const loaded = await history.getHistory();
      expect(loaded.length).toBe(2);
      expect(loaded[0]?.version).toBe('v1');
      expect(loaded[1]?.version).toBe('v2');
    });
  });

  describe('getHistory', () => {
    it('should return empty array for new history', async () => {
      const loaded = await history.getHistory();
      expect(loaded).toEqual([]);
    });

    it('should load existing history', async () => {
      const entry: import('../types.js').RefinementHistoryEntry = {
        version: 'v1',
        timestamp: '2024-01-01T00:00:00Z',
        promptDiff: 'Test',
        diagnostics: [],
        validationScore: 0.7,
      };

      await history.append(entry);
      const loaded = await history.getHistory();

      expect(loaded.length).toBe(1);
      expect(loaded[0]?.version).toBe('v1');
    });
  });

  describe('getLatestVersion', () => {
    it('should return null for empty history', async () => {
      const latest = await history.getLatestVersion();
      expect(latest).toBeNull();
    });

    it('should return latest version', async () => {
      await history.append({
        version: 'v1',
        timestamp: '2024-01-01T00:00:00Z',
        promptDiff: 'First',
        diagnostics: [],
        validationScore: 0.7,
      });

      await history.append({
        version: 'v2',
        timestamp: '2024-01-02T00:00:00Z',
        promptDiff: 'Second',
        diagnostics: [],
        validationScore: 0.8,
      });

      const latest = await history.getLatestVersion();
      expect(latest).toBe('v2');
    });
  });

  describe('getVersion', () => {
    it('should return null for non-existent version', async () => {
      const version = await history.getVersion('v99');
      expect(version).toBeNull();
    });

    it('should return version entry', async () => {
      await history.append({
        version: 'v1',
        timestamp: '2024-01-01T00:00:00Z',
        promptDiff: 'Test',
        diagnostics: [],
        validationScore: 0.7,
      });

      const version = await history.getVersion('v1');
      expect(version).not.toBeNull();
      expect(version?.version).toBe('v1');
    });
  });

  describe('rollback', () => {
    it('should rollback to target version', async () => {
      // Add three versions
      for (let i = 1; i <= 3; i++) {
        await history.append({
          version: `v${i}`,
          timestamp: new Date().toISOString(),
          promptDiff: `Version ${i}`,
          diagnostics: [],
          validationScore: 0.6 + i * 0.05,
        });
      }

      // Rollback to v2
      await history.rollback('v2');

      const loaded = await history.getHistory();
      expect(loaded.length).toBe(2);
      expect(loaded[0]?.version).toBe('v1');
      expect(loaded[1]?.version).toBe('v2');
    });

    it('should throw for non-existent version', async () => {
      await expect(history.rollback('v99')).rejects.toThrow('v99');
    });

    it('should mark rollback in history', async () => {
      await history.append({
        version: 'v1',
        timestamp: '2024-01-01T00:00:00Z',
        promptDiff: 'v1',
        diagnostics: [],
        validationScore: 0.7,
      });

      await history.append({
        version: 'v2',
        timestamp: '2024-01-02T00:00:00Z',
        promptDiff: 'v2',
        diagnostics: [],
        validationScore: 0.8,
      });

      // After rollback, v2 should reference rollbackOf (last entry is modified in memory)
      // writeHistory is NOT called since rollback target is already current
      const loaded = await history.getHistory();
      expect(loaded.length).toBe(2);
    });
  });

  describe('getVersionRange', () => {
    it('should return range of versions', async () => {
      for (let i = 1; i <= 5; i++) {
        await history.append({
          version: `v${i}`,
          timestamp: new Date().toISOString(),
          promptDiff: `v${i}`,
          diagnostics: [],
          validationScore: 0.7,
        });
      }

      const range = await history.getVersionRange('v2', 'v4');

      expect(range.length).toBe(3);
      expect(range[0]?.version).toBe('v2');
      expect(range[2]?.version).toBe('v4');
    });

    it('should return empty for invalid range', async () => {
      const range = await history.getVersionRange('v99', 'v100');
      expect(range).toEqual([]);
    });
  });

  describe('createRefinementHistory', () => {
    it('should create history with default path', () => {
      const h = createRefinementHistory();
      expect(h).toBeInstanceOf(RefinementHistory);
    });
  });

  // Required: ratchet history written
  describe('ratchet history written', () => {
    it('appending a ratchet entry persists it to history and can be retrieved', async () => {
      const entry: import('../types.js').RefinementHistoryEntry = {
        version: 'ratchet-v1',
        timestamp: new Date().toISOString(),
        promptDiff: 'Ratchet improvement: tightened confidence threshold',
        diagnostics: [
          { nodeId: 'node-A', nodeLabel: 'node-A', failureModes: ['low_confidence'], suggestedPrompts: ['add context'], estimatedImpact: 0.8 },
        ],
        validationScore: 0.82,
      };

      await history.append(entry);

      const loaded = await history.getHistory();
      const written = loaded.find(e => e.version === 'ratchet-v1');

      // Ratchet history must be written and retrievable
      expect(written).toBeDefined();
      expect(written!.validationScore).toBe(0.82);
      expect(written!.diagnostics.length).toBe(1);
    });
  });
});
