/**
 * Rate dispatcher — wraps LLM provider calls with adaptive backoff, circuit breaker,
 * rate limiting, and throughput metrics.
 */

import type {
  DispatcherConfig,
  DispatcherState,
  ThroughputMetrics,
  LLMProvider,
} from "../types.js";

export class RateDispatcher {
  private readonly config: DispatcherConfig;

  private state: DispatcherState = {
    circuit_open: false,
    consecutive_failures: 0,
    total_dispatches: 0,
  };

  private metrics: ThroughputMetrics = {
    calls_total: 0,
    calls_succeeded: 0,
    calls_failed: 0,
    calls_rate_limited: 0,
    avg_latency_ms: 0,
    tokens_per_minute: 0,
  };

  // Rolling window for throughput tracking (in ms)
  private rollingWindowMs = 60_000;
  private callTimestamps: number[] = [];
  private tokenCounts: number[] = [];
  private latencySumMs = 0;
  private latencyCount = 0;

  constructor(config: DispatcherConfig, _provider?: LLMProvider) {
    this.config = config;
  }

  /**
   * Execute a dispatch call with rate limiting, backoff, and circuit breaker.
   */
  async dispatch<T>(fn: () => Promise<T>): Promise<T> {
    this.state.total_dispatches++;

    // Circuit breaker check
    if (this.state.circuit_open) {
      const resetAt = (this.state.circuit_opened_at ?? 0) + this.config.circuit_breaker_reset_ms;
      if (Date.now() < resetAt) {
        throw new Error("Circuit breaker is open — service unavailable");
      }
      // Reset circuit
      this.state.circuit_open = false;
      this.state.consecutive_failures = 0;
    }

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < this.config.retry_attempts) {
      try {
        const start = Date.now();
        const result = await fn();
        const elapsed = Date.now() - start;

        this.recordSuccess(elapsed);
        return result;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        attempt++;

        const isRateLimited = this.isRateLimitError(lastError);
        if (isRateLimited) {
          this.metrics.calls_rate_limited++;
        }

        this.recordFailure();

        // Check circuit breaker
        if (this.state.consecutive_failures >= this.config.circuit_breaker_threshold) {
          this.state.circuit_open = true;
          this.state.circuit_opened_at = Date.now();
          throw new Error(`Circuit breaker opened after ${this.state.consecutive_failures} consecutive failures`);
        }

        if (attempt < this.config.retry_attempts) {
          const backoffMs = this.computeBackoff(attempt);
          await this.sleep(backoffMs);
        }
      }
    }

    throw lastError ?? new Error("dispatch failed after retries");
  }

  private computeBackoff(attempt: number): number {
    const backoff = Math.min(
      this.config.backoff_base_ms * Math.pow(this.config.backoff_multiplier, attempt - 1),
      this.config.backoff_max_ms
    );
    // Add jitter (±10%)
    const jitter = backoff * 0.1 * (Math.random() * 2 - 1);
    return Math.round(backoff + jitter);
  }

  private isRateLimitError(err: Error): boolean {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("rate_limit") ||
      msg.includes("rate limit") ||
      msg.includes("429") ||
      msg.includes("too many requests") ||
      msg.includes("quota") ||
      msg.includes("throttle")
    );
  }

  private recordSuccess(latencyMs: number): void {
    this.metrics.calls_succeeded++;
    this.metrics.calls_total++;
    this.latencySumMs += latencyMs;
    this.latencyCount++;
    this.metrics.avg_latency_ms = Math.round(this.latencySumMs / this.latencyCount);
    this.state.consecutive_failures = 0;
    this.callTimestamps.push(Date.now());
    this.tokenCounts.push(0); // caller can update via getMetrics
  }

  private recordFailure(): void {
    this.metrics.calls_failed++;
    this.metrics.calls_total++;
    this.state.consecutive_failures++;
  }

  /**
   * Update token count for rate calculation.
   */
  recordTokens(tokenCount: number): void {
    if (this.tokenCounts.length > 0) {
      this.tokenCounts[this.tokenCounts.length - 1] = tokenCount;
    }
    // Recompute tokens per minute
    const cutoff = Date.now() - this.rollingWindowMs;
    const recentCalls = this.callTimestamps.filter(t => t > cutoff);
    const recentTokens = this.tokenCounts.slice(-recentCalls.length);
    const totalTokens = recentTokens.reduce((s, n) => s + n, 0);
    this.metrics.tokens_per_minute = totalTokens;
  }

  getState(): DispatcherState {
    return { ...this.state };
  }

  getMetrics(): ThroughputMetrics {
    // Recompute tokens_per_minute from rolling window
    const cutoff = Date.now() - this.rollingWindowMs;
    const recentIdx = this.callTimestamps.findIndex(t => t > cutoff);
    const recentTokens = recentIdx >= 0 ? this.tokenCounts.slice(recentIdx) : [];
    const totalTokens = recentTokens.reduce((s, n) => s + n, 0);
    return { ...this.metrics, tokens_per_minute: totalTokens };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}