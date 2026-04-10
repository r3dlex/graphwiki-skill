import { describe, it, expect } from "vitest";
import { RateDispatcher } from "./rate-dispatcher.js";
import type { DispatcherConfig, LLMProvider } from "../types.js";

const makeProvider = (latencyMs = 10): LLMProvider =>
  ({
    complete: async () => {
      await new Promise(r => setTimeout(r, latencyMs));
      return "result";
    },
    completeMessages: async () => "result",
    getTokenizer: () => ({
      encode: async () => [1, 2, 3],
      decode: async () => "text",
      tokenCount: async () => 3,
    }),
  }) as unknown as LLMProvider;

const defaultConfig: DispatcherConfig = {
  requests_per_minute: 60,
  burst_limit: 10,
  backoff_base_ms: 10,
  backoff_max_ms: 100,
  backoff_multiplier: 2,
  circuit_breaker_threshold: 3,
  circuit_breaker_reset_ms: 1000,
  retry_attempts: 3,
};

describe("RateDispatcher", () => {
  it("dispatches successfully and records metrics", async () => {
    const dispatcher = new RateDispatcher(defaultConfig, makeProvider());
    const result = await dispatcher.dispatch(() => Promise.resolve("success"));
    expect(result).toBe("success");

    const metrics = dispatcher.getMetrics();
    expect(metrics.calls_total).toBe(1);
    expect(metrics.calls_succeeded).toBe(1);
    expect(metrics.calls_failed).toBe(0);
  });

  it("retries on transient failure and succeeds on later attempt", async () => {
    let attempts = 0;
    const dispatcher = new RateDispatcher(defaultConfig, makeProvider());
    const result = await dispatcher.dispatch(async () => {
      attempts++;
      if (attempts < 3) throw new Error("Transient error");
      return "recovered";
    });
    expect(result).toBe("recovered");
    expect(attempts).toBe(3);
  });

  it("opens circuit breaker after consecutive failures reach threshold", async () => {
    // threshold=2, retry_attempts=2 → up to 2 tries per dispatch
    // with fn always throwing, both tries fail → 2 consecutive failures → circuit opens
    const config = { ...defaultConfig, circuit_breaker_threshold: 2, retry_attempts: 2 };
    const dispatcher = new RateDispatcher(config, makeProvider());
    await expect(
      dispatcher.dispatch(async () => {
        throw new Error("fail");
      })
    ).rejects.toThrow("Circuit breaker opened");
    expect(dispatcher.getState().circuit_open).toBe(true);
  });

  it("circuit breaker auto-resets and allows dispatch after reset window", async () => {
    const config = { ...defaultConfig, circuit_breaker_threshold: 1, circuit_breaker_reset_ms: 50, retry_attempts: 1 };
    const dispatcher = new RateDispatcher(config, makeProvider());

    // Open the circuit (1 failure opens threshold=1)
    await expect(
      dispatcher.dispatch(async () => {
        throw new Error("fail");
      })
    ).rejects.toThrow();
    expect(dispatcher.getState().circuit_open).toBe(true);

    // Wait for reset window
    await new Promise(r => setTimeout(r, 60));

    // Next dispatch should succeed and reset circuit
    const result = await dispatcher.dispatch(() => Promise.resolve("recovered"));
    expect(result).toBe("recovered");
    expect(dispatcher.getState().circuit_open).toBe(false);
  });

  it("records rate limited calls", async () => {
    const dispatcher = new RateDispatcher(defaultConfig, makeProvider());
    await expect(
      dispatcher.dispatch(async () => {
        throw new Error("rate_limit hit");
      })
    ).rejects.toThrow();
    expect(dispatcher.getMetrics().calls_rate_limited).toBeGreaterThan(0);
  });

  it("getState returns current dispatcher state", () => {
    const dispatcher = new RateDispatcher(defaultConfig, makeProvider());
    const state = dispatcher.getState();
    expect(state).toHaveProperty("circuit_open");
    expect(state).toHaveProperty("consecutive_failures");
    expect(state).toHaveProperty("total_dispatches");
  });

  it("getMetrics returns throughput metrics", () => {
    const dispatcher = new RateDispatcher(defaultConfig, makeProvider());
    dispatcher.dispatch(() => Promise.resolve("ok")).catch(() => {});
    const metrics = dispatcher.getMetrics();
    expect(metrics).toHaveProperty("calls_total");
    expect(metrics).toHaveProperty("avg_latency_ms");
    expect(metrics).toHaveProperty("tokens_per_minute");
  });

  it("exhausts all retry attempts before throwing", async () => {
    const config = { ...defaultConfig, backoff_max_ms: 20, backoff_base_ms: 10, backoff_multiplier: 2 };
    const d2 = new RateDispatcher(config, makeProvider());
    let attempts = 0;
    await expect(
      d2.dispatch(async () => {
        attempts++;
        throw new Error("persistent fail");
      })
    ).rejects.toThrow();
    expect(attempts).toBe(config.retry_attempts);
  });
});