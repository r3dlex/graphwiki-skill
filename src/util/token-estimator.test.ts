import { describe, it, expect } from "vitest";
import { estimateTokens, estimateMessagesTokens } from "./token-estimator.js";

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns 1 for very short string", () => {
    expect(estimateTokens("a")).toBe(1);
  });

  it("scales with character count", () => {
    const text = "hello world this is a test string";
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThanOrEqual(text.length);
  });

  it("handles code with special characters", () => {
    const code = "function foo() { return 'bar'; }";
    const tokens = estimateTokens(code);
    expect(tokens).toBeGreaterThan(0);
  });

  it("handles unicode", () => {
    const text = "こんにちは世界 مرحبا";
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(0);
  });

  it("is consistent for same input", () => {
    const text = "consistent text";
    expect(estimateTokens(text)).toBe(estimateTokens(text));
  });
});

describe("estimateMessagesTokens", () => {
  it("returns overhead for empty array", () => {
    // 3 tokens for cycle markers
    const total = estimateMessagesTokens([]);
    expect(total).toBe(3);
  });

  it("accumulates content tokens plus overhead", () => {
    const messages = [
      { role: "user" as const, content: "hello" },
      { role: "assistant" as const, content: "hi" },
    ];
    const total = estimateMessagesTokens(messages);
    expect(total).toBeGreaterThan(10); // at least content + role overhead + cycle marker
  });

  it("handles system messages", () => {
    const messages = [
      { role: "system" as const, content: "You are a helpful assistant." },
    ];
    const total = estimateMessagesTokens(messages);
    expect(total).toBeGreaterThan(5);
  });

  it("handles long content", () => {
    const messages = [
      { role: "user" as const, content: "a".repeat(1000) },
    ];
    const total = estimateMessagesTokens(messages);
    // 1000 chars / 4 = 250 tokens + overhead
    expect(total).toBeGreaterThan(250);
  });

  it("is consistent for same messages", () => {
    const messages = [
      { role: "user" as const, content: "test message" },
      { role: "assistant" as const, content: "test response" },
    ];
    expect(estimateMessagesTokens(messages)).toBe(estimateMessagesTokens(messages));
  });
});