// Token counter with tiktoken-compatible estimation for GraphWiki v2

import type { Message } from '../types.js';

/**
 * TokenCounter - Estimates token usage using tiktoken-compatible approach
 *
 * Uses character-based estimation as a fallback when tiktoken is not available.
 * Records per-call and cumulative tracking.
 */
export class TokenCounter {
  private cumulativeTokens = 0;
  private callCount = 0;
  private outputPath?: string;

  constructor(outputPath?: string) {
    this.outputPath = outputPath;
  }

  /**
   * Estimate token count for a text string
   * Uses a tiktoken-compatible approach:
   * - Split by whitespace and punctuation
   * - Count tokens as ~4 chars per token for English
   * - Handle special characters and numbers
   */
  count(text: string): number {
    if (!text || text.length === 0) return 0;

    // Split into chunks (words, punctuation, numbers)
    const tokens = this.tokenize(text);

    // Apply tiktoken-style encoding rules
    // 1. Count special tokens
    let count = 0;
    for (const token of tokens) {
      count += this.estimateTokenLength(token);
    }

    // 2. Add overhead for message structure (only when there are actual tokens and non-CJK)
    // Each message has ~3 tokens overhead (role, content markers)
    // CJK characters are already counted efficiently at 1 per char, no overhead needed
    if (count > 0 && !/[\u4e00-\u9fff\u3040-\u30ff]/.test(text)) count += 3;

    return count;
  }

  /**
   * Count tokens for a message array
   */
  countMessages(messages: Message[]): number {
    let total = 0;

    for (const message of messages) {
      // Role token (typically 1-4 tokens)
      total += 4;

      // Content tokens
      total += this.count(message.content);

      // Name field if present (for function calls)
      if (message.name) {
        total += this.count(message.name) + 1;
      }
    }

    // Add overhead for message array structure
    // System message adds ~3 tokens
    // Final turn adds ~3 tokens
    total += 3 + 3;

    return total;
  }

  /**
   * Record a token count and update cumulative stats
   */
  record(tokens: number): void {
    this.cumulativeTokens += tokens;
    this.callCount++;
  }

  /**
   * Get cumulative token count
   */
  getCumulative(): number {
    return this.cumulativeTokens;
  }

  /**
   * Get number of calls made
   */
  getCallCount(): number {
    return this.callCount;
  }

  /**
   * Get average tokens per call
   */
  getAveragePerCall(): number {
    if (this.callCount === 0) return 0;
    return this.cumulativeTokens / this.callCount;
  }

  /**
   * Reset all counters
   */
  reset(): void {
    this.cumulativeTokens = 0;
    this.callCount = 0;
  }

  /**
   * Write current stats to output file
   */
  async writeStats(): Promise<void> {
    if (!this.outputPath) return;

    const stats = {
      timestamp: new Date().toISOString(),
      cumulative_tokens: this.cumulativeTokens,
      call_count: this.callCount,
      average_per_call: this.getAveragePerCall(),
    };

    // Dynamic import to handle ESM
    const { writeFile } = await import('fs/promises');
    const { mkdir } = await import('fs/promises');

    const dir = this.outputPath.substring(0, this.outputPath.lastIndexOf('/'));
    await mkdir(dir, { recursive: true });
    await writeFile(this.outputPath, JSON.stringify(stats, null, 2));
  }

  /**
   * Tokenize text into estimation units
   */
  private tokenize(text: string): string[] {
    // Split on whitespace and common punctuation
    // This mimics tiktoken's splitting behavior
    return text
      .replace(/([\s\n\r]+)/g, ' ')
      .split(/(?<=\s)(?=\S)|(?<=\S)(?=\s)|(?<=[.,!?;:])(?=\S)|(?<=\S)(?=[.,!?;:])/)
      .filter(t => t.length > 0);
  }

  /**
   * Estimate token length for a single token
   * Tiktoken uses BPE which counts:
   * - Common English words: 1 token each
   * - Numbers and punctuation: varies
   * - Unicode characters: more tokens
   */
  private estimateTokenLength(token: string): number {
    // Empty or whitespace
    if (!token || /^\s+$/.test(token)) return 0;

    // ASCII text (English) - average ~4 chars per token
    if (/^[a-zA-Z0-9\s.,!?;:'"-]+$/.test(token)) {
      return Math.ceil(token.length / 4);
    }

    // Unicode text - typically more tokens per character
    if (/[^\x00-\x7F]/.test(token)) {
      // Chinese/Japanese/Korean: ~1-2 chars per token
      if (/[\u4e00-\u9fff\u3040-\u30ff]/.test(token)) {
        return token.length;
      }
      // Other unicode: ~2 chars per token
      return Math.ceil(token.length / 2);
    }

    // Code-like tokens (brackets, operators, etc.)
    if (/^[\[\]{}(){}<>@#$%^&*+=~/\\|]+$/.test(token)) {
      // Each symbol is typically 1 token
      return token.length;
    }

    // Mixed content: default to character-based
    return Math.ceil(token.length / 4);
  }
}

/**
 * Singleton instance for global token counting
 */
let globalCounter: TokenCounter | null = null;

export function getGlobalCounter(): TokenCounter {
  if (!globalCounter) {
    globalCounter = new TokenCounter('graphwiki-out/benchmark/token-counter.json');
  }
  return globalCounter;
}

export function setGlobalCounter(counter: TokenCounter): void {
  globalCounter = counter;
}
