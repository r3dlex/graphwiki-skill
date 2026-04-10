import { describe, it, expect } from 'vitest';
import { Ratchet, createRatchet } from './ratchet.js';
import type { QueryScore } from '../types.js';

describe('Ratchet', () => {
  let ratchet: Ratchet;

  beforeEach(() => {
    ratchet = new Ratchet();
  });

  describe('computeComposite', () => {
    it('should compute weighted composite score', () => {
      const score: QueryScore = {
        query: 'test',
        confidence: 0.8,
        efficiency: 0.6,
        tier: 3,
        tokens: 1000,
      };

      // (0.8 * 0.4) + (0.6 * 0.3) + (1.0 * 0.3) = 0.32 + 0.18 + 0.30 = 0.80
      expect(ratchet.computeComposite(score)).toBeCloseTo(0.80);
    });

    it('should weight confidence highest', () => {
      const highConfidence: QueryScore = {
        query: 'test',
        confidence: 1.0,
        efficiency: 0.0,
        tier: 1,
        tokens: 1000,
      };

      const highEfficiency: QueryScore = {
        query: 'test',
        confidence: 0.0,
        efficiency: 1.0,
        tier: 1,
        tokens: 1000,
      };

      // Confidence weighted at 0.4, efficiency at 0.3
      const confScore = ratchet.computeComposite(highConfidence);
      const effScore = ratchet.computeComposite(highEfficiency);

      expect(confScore).toBeGreaterThan(effScore);
    });
  });

  describe('computeAverageComposite', () => {
    it('should compute average of multiple scores', () => {
      const scores: QueryScore[] = [
        { query: 'test1', confidence: 0.6, efficiency: 0.6, tier: 2, tokens: 1000 },
        { query: 'test2', confidence: 0.8, efficiency: 0.8, tier: 2, tokens: 1000 },
      ];

      const avg = ratchet.computeAverageComposite(scores);

      // Tier 2 = 0.66 normalized
      // Score 1: (0.6 * 0.4) + (0.6 * 0.3) + (0.66 * 0.3) = 0.24 + 0.18 + 0.198 = 0.618
      // Score 2: (0.8 * 0.4) + (0.8 * 0.3) + (0.66 * 0.3) = 0.32 + 0.24 + 0.198 = 0.758
      // Avg: 0.688
      expect(avg).toBeGreaterThan(0.6);
    });

    it('should return 0 for empty array', () => {
      expect(ratchet.computeAverageComposite([])).toBe(0);
    });
  });

  describe('normalizeTier', () => {
    it('should normalize tier 1 to ~0.33', () => {
      expect(ratchet.normalizeTier(1)).toBeCloseTo(0.333, 2);
    });

    it('should normalize tier 2 to ~0.66', () => {
      expect(ratchet.normalizeTier(2)).toBeCloseTo(0.666, 2);
    });

    it('should normalize tier 3 to 1.0', () => {
      expect(ratchet.normalizeTier(3)).toBe(1.0);
    });

    it('should clamp values above 3', () => {
      expect(ratchet.normalizeTier(5)).toBe(1.0);
    });

    it('should clamp values below 0', () => {
      expect(ratchet.normalizeTier(-1)).toBe(0);
    });
  });

  describe('isFailure', () => {
    it('should identify scores below threshold as failure', () => {
      const failingScore: QueryScore = {
        query: 'test',
        confidence: 0.3,
        efficiency: 0.3,
        tier: 1,
        tokens: 10000,
      };

      expect(ratchet.isFailure(failingScore)).toBe(true);
    });

    it('should pass scores above threshold', () => {
      const passingScore: QueryScore = {
        query: 'test',
        confidence: 0.8,
        efficiency: 0.7,
        tier: 3,
        tokens: 1000,
      };

      expect(ratchet.isFailure(passingScore)).toBe(false);
    });
  });

  describe('identifyFailures', () => {
    it('should return only failing scores', () => {
      const scores: QueryScore[] = [
        { query: 'pass1', confidence: 0.9, efficiency: 0.9, tier: 3, tokens: 100 },
        { query: 'fail1', confidence: 0.3, efficiency: 0.3, tier: 1, tokens: 10000 },
        { query: 'pass2', confidence: 0.7, efficiency: 0.7, tier: 2, tokens: 500 },
      ];

      const failures = ratchet.identifyFailures(scores);

      expect(failures.length).toBe(1);
      expect(failures[0].query).toBe('fail1');
    });
  });

  describe('getFailureRate', () => {
    it('should return 0 for all passing', () => {
      const scores: QueryScore[] = [
        { query: 'pass1', confidence: 0.8, efficiency: 0.8, tier: 3, tokens: 100 },
        { query: 'pass2', confidence: 0.7, efficiency: 0.7, tier: 2, tokens: 500 },
      ];

      expect(ratchet.getFailureRate(scores)).toBe(0);
    });

    it('should return 1.0 for all failing', () => {
      const scores: QueryScore[] = [
        { query: 'fail1', confidence: 0.2, efficiency: 0.2, tier: 1, tokens: 10000 },
        { query: 'fail2', confidence: 0.3, efficiency: 0.3, tier: 1, tokens: 10000 },
      ];

      expect(ratchet.getFailureRate(scores)).toBe(1.0);
    });

    it('should return 0 for empty array', () => {
      expect(ratchet.getFailureRate([])).toBe(0);
    });
  });

  describe('validate', () => {
    it('should pass when validation holds or improves', () => {
      const tuningScores: QueryScore[] = [
        { query: 'test1', confidence: 0.7, efficiency: 0.7, tier: 2, tokens: 1000 },
      ];

      const validationScores: QueryScore[] = [
        { query: 'test1', confidence: 0.75, efficiency: 0.75, tier: 2, tokens: 900 },
      ];

      const result = ratchet.validate(tuningScores, validationScores);

      expect(result.passed).toBe(true);
      expect(result.compositeScore).toBeGreaterThan(0);
    });

    it('should fail when scores drop significantly', () => {
      const tuningScores: QueryScore[] = [
        { query: 'test1', confidence: 0.8, efficiency: 0.8, tier: 3, tokens: 500 },
      ];

      const validationScores: QueryScore[] = [
        { query: 'test1', confidence: 0.4, efficiency: 0.4, tier: 1, tokens: 5000 },
      ];

      const result = ratchet.validate(tuningScores, validationScores);

      expect(result.passed).toBe(false);
      expect(result.details.change).toBeLessThan(0);
    });

    it('should handle empty arrays', () => {
      const result = ratchet.validate([], []);

      expect(result.passed).toBe(false);
      expect(result.compositeScore).toBe(0);
    });
  });

  describe('computeImprovement', () => {
    it('should compute improvement metrics', () => {
      const before: QueryScore[] = [
        { query: 'test1', confidence: 0.6, efficiency: 0.6, tier: 2, tokens: 1000 },
        { query: 'test2', confidence: 0.6, efficiency: 0.6, tier: 2, tokens: 1000 },
      ];

      const after: QueryScore[] = [
        { query: 'test1', confidence: 0.8, efficiency: 0.8, tier: 3, tokens: 800 },
        { query: 'test2', confidence: 0.5, efficiency: 0.5, tier: 1, tokens: 2000 },
      ];

      const improvement = ratchet.computeImprovement(before, after);

      expect(improvement.queriesImproved).toBeGreaterThanOrEqual(0);
      expect(improvement.queriesDegraded).toBeGreaterThanOrEqual(0);
    });

    it('should throw for mismatched arrays', () => {
      const before: QueryScore[] = [
        { query: 'test1', confidence: 0.6, efficiency: 0.6, tier: 2, tokens: 1000 },
      ];

      const after: QueryScore[] = [
        { query: 'test1', confidence: 0.8, efficiency: 0.8, tier: 3, tokens: 800 },
        { query: 'test2', confidence: 0.5, efficiency: 0.5, tier: 1, tokens: 2000 },
      ];

      expect(() => ratchet.computeImprovement(before, after)).toThrow();
    });
  });

  describe('getThreshold', () => {
    it('should return failure threshold', () => {
      expect(ratchet.getThreshold()).toBe(0.6);
    });
  });

  describe('createRatchet', () => {
    it('should create ratchet instance', () => {
      const r = createRatchet();
      expect(r).toBeInstanceOf(Ratchet);
    });
  });
});
