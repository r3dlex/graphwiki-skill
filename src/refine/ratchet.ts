// Ratchet validation gate for GraphWiki v2
// Validates that refinement improvements are genuine

import type { QueryScore, ValidationResult } from '../types.js';

/**
 * Ratchet validation gate
 *
 * Holds refinement only if validation scores hold or improve.
 * Composite score: (confidence * 0.4) + (efficiency * 0.3) + (tier * 0.3)
 * Threshold: 0.6 for failure identification
 */
export class Ratchet {
  private readonly CONFIDENCE_WEIGHT = 0.4;
  private readonly EFFICIENCY_WEIGHT = 0.3;
  private readonly TIER_WEIGHT = 0.3;
  private readonly FAILURE_THRESHOLD = 0.6;

  /**
   * Validate that tuning scores are sustained in validation scores
   */
  validate(tuningScores: QueryScore[], validationScores: QueryScore[]): ValidationResult {
    if (tuningScores.length === 0 || validationScores.length === 0) {
      return {
        passed: false,
        compositeScore: 0,
        details: {
          previousAvg: 0,
          currentAvg: 0,
          change: 0,
          threshold: this.FAILURE_THRESHOLD,
        },
      };
    }

    const previousAvg = this.computeAverageComposite(tuningScores);
    const currentAvg = this.computeAverageComposite(validationScores);
    const change = currentAvg - previousAvg;

    const compositeScore = currentAvg;
    const passed = compositeScore >= this.FAILURE_THRESHOLD && change >= -0.1;

    return {
      passed,
      compositeScore,
      details: {
        previousAvg,
        currentAvg,
        change,
        threshold: this.FAILURE_THRESHOLD,
      },
    };
  }

  /**
   * Compute composite score for a single query
   */
  computeComposite(score: QueryScore): number {
    return (
      score.confidence * this.CONFIDENCE_WEIGHT +
      score.efficiency * this.EFFICIENCY_WEIGHT +
      this.normalizeTier(score.tier) * this.TIER_WEIGHT
    );
  }

  /**
   * Compute average composite score
   */
  computeAverageComposite(scores: QueryScore[]): number {
    if (scores.length === 0) return 0;

    const total = scores.reduce((sum, s) => sum + this.computeComposite(s), 0);
    return total / scores.length;
  }

  /**
   * Normalize tier to 0-1 scale
   * Tier 1 -> 0.33, Tier 2 -> 0.66, Tier 3 -> 1.0
   */
  normalizeTier(tier: number): number {
    const normalized = tier / 3;
    return Math.min(1, Math.max(0, normalized));
  }

  /**
   * Check if a score indicates failure
   */
  isFailure(score: QueryScore): boolean {
    return this.computeComposite(score) < this.FAILURE_THRESHOLD;
  }

  /**
   * Identify failing queries from scores
   */
  identifyFailures(scores: QueryScore[]): QueryScore[] {
    return scores.filter(s => this.isFailure(s));
  }

  /**
   * Get failure rate
   */
  getFailureRate(scores: QueryScore[]): number {
    if (scores.length === 0) return 0;
    const failures = this.identifyFailures(scores);
    return failures.length / scores.length;
  }

  /**
   * Compute improvement delta between two score sets
   */
  computeImprovement(
    beforeScores: QueryScore[],
    afterScores: QueryScore[]
  ): {
    avgImprovement: number;
    maxImprovement: number;
    queriesImproved: number;
    queriesDegraded: number;
  } {
    if (beforeScores.length !== afterScores.length) {
      throw new Error('Score arrays must have same length');
    }

    const deltas: number[] = [];
    let queriesImproved = 0;
    let queriesDegraded = 0;

    for (let i = 0; i < beforeScores.length; i++) {
      const before = this.computeComposite(beforeScores[i]);
      const after = this.computeComposite(afterScores[i]);
      const delta = after - before;

      deltas.push(delta);

      if (delta > 0.05) {
        queriesImproved++;
      } else if (delta < -0.05) {
        queriesDegraded++;
      }
    }

    const avgImprovement = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const maxImprovement = Math.max(...deltas);

    return {
      avgImprovement,
      maxImprovement,
      queriesImproved,
      queriesDegraded,
    };
  }

  /**
   * Get threshold
   */
  getThreshold(): number {
    return this.FAILURE_THRESHOLD;
  }

  /**
   * Set custom threshold
   */
  setThreshold(threshold: number): void {
    // Note: This would need to be a setter pattern for proper encapsulation
    // For now, threshold is read-only
  }
}

/**
 * Create ratchet instance
 */
export function createRatchet(): Ratchet {
  return new Ratchet();
}
