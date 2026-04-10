import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TokenCounter, getGlobalCounter, setGlobalCounter } from './token-counter.js';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';

const TEST_DIR = '/tmp/graphwiki-test-token-counter';

describe('TokenCounter', () => {
  describe('count', () => {
    it('should return 0 for empty string', () => {
      const counter = new TokenCounter();
      expect(counter.count('')).toBe(0);
    });

    it('should return 0 for whitespace only', () => {
      const counter = new TokenCounter();
      expect(counter.count('   \n\t  ')).toBe(0);
    });

    it('should estimate English text tokens', () => {
      const counter = new TokenCounter();
      // "Hello world" is approximately 2 tokens (1-2 per word typically)
      const result = counter.count('Hello world');
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(10);
    });

    it('should estimate code tokens', () => {
      const counter = new TokenCounter();
      const code = 'function foo() { return 42; }';
      const result = counter.count(code);
      expect(result).toBeGreaterThan(0);
    });

    it('should handle unicode characters', () => {
      const counter = new TokenCounter();
      const chinese = '你好世界';
      const result = counter.count(chinese);
      // Chinese characters are typically 1 token each
      expect(result).toBe(4);
    });

    it('should handle mixed content', () => {
      const counter = new TokenCounter();
      const mixed = 'Hello 世界! function foo() { return 42; }';
      const result = counter.count(mixed);
      expect(result).toBeGreaterThan(0);
    });

    it('should count punctuation separately', () => {
      const counter = new TokenCounter();
      const withPunct = 'Hello, world!';
      const withoutPunct = 'Hello world';
      // With punctuation should have more tokens
      expect(counter.count(withPunct)).toBeGreaterThanOrEqual(counter.count(withoutPunct));
    });
  });

  describe('countMessages', () => {
    it('should count single user message', () => {
      const counter = new TokenCounter();
      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const result = counter.countMessages(messages);
      expect(result).toBeGreaterThan(0);
    });

    it('should count multiple messages', () => {
      const counter = new TokenCounter();
      const messages = [
        { role: 'system' as const, content: 'You are a helpful assistant.' },
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi there!' },
      ];
      const result = counter.countMessages(messages);
      expect(result).toBeGreaterThan(0);
    });

    it('should handle messages with name field', () => {
      const counter = new TokenCounter();
      const messages = [
        { role: 'user' as const, content: 'Hello', name: 'test_user' },
      ];
      const result = counter.countMessages(messages);
      expect(result).toBeGreaterThan(0);
    });
  });

  describe('record', () => {
    it('should track cumulative tokens', () => {
      const counter = new TokenCounter();
      counter.record(100);
      counter.record(200);
      expect(counter.getCumulative()).toBe(300);
    });

    it('should track call count', () => {
      const counter = new TokenCounter();
      counter.record(100);
      counter.record(200);
      expect(counter.getCallCount()).toBe(2);
    });
  });

  describe('getAveragePerCall', () => {
    it('should return 0 when no calls', () => {
      const counter = new TokenCounter();
      expect(counter.getAveragePerCall()).toBe(0);
    });

    it('should return correct average', () => {
      const counter = new TokenCounter();
      counter.record(100);
      counter.record(200);
      expect(counter.getAveragePerCall()).toBe(150);
    });
  });

  describe('reset', () => {
    it('should reset all counters', () => {
      const counter = new TokenCounter();
      counter.record(100);
      counter.reset();
      expect(counter.getCumulative()).toBe(0);
      expect(counter.getCallCount()).toBe(0);
    });
  });

  describe('writeStats', () => {
    beforeEach(async () => {
      await mkdir(TEST_DIR, { recursive: true });
    });

    afterEach(async () => {
      try {
        await rm(TEST_DIR, { recursive: true, force: true });
      } catch {}
    });

    it('should write stats to file', async () => {
      const outputPath = join(TEST_DIR, 'stats.json');
      const counter = new TokenCounter(outputPath);
      counter.record(100);
      counter.record(200);

      await counter.writeStats();

      // Check file exists
      const { readFile } = await import('fs/promises');
      const content = await readFile(outputPath, 'utf-8');
      const stats = JSON.parse(content);

      expect(stats.cumulative_tokens).toBe(300);
      expect(stats.call_count).toBe(2);
      expect(stats.average_per_call).toBe(150);
    });

    it('should not write if no output path', async () => {
      const counter = new TokenCounter();
      counter.record(100);

      // Should not throw
      await expect(counter.writeStats()).resolves.not.toThrow();
    });
  });

  describe('global counter', () => {
    afterEach(() => {
      setGlobalCounter(new TokenCounter());
    });

    it('should get and set global counter', () => {
      getGlobalCounter(); // Initialize
      const counter2 = new TokenCounter();
      setGlobalCounter(counter2);
      const counter3 = getGlobalCounter();
      expect(counter3).toBe(counter2);
    });
  });
});
