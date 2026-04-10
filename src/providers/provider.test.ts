import { describe, it, expect } from 'vitest';
import { validateProvider, estimateCostPerMillionTokens, DEFAULT_COMPLETION_OPTIONS } from './provider.js';

describe('provider', () => {
  describe('validateProvider', () => {
    it('should return true for valid provider', () => {
      const provider = {
        complete: async () => ({ content: 'test' }),
        supportedDocumentFormats: () => ['pdf'],
        supportedImageFormats: () => ['png'],
        maxDocumentPages: () => 100,
        maxImageResolution: () => 4096,
        extractFromDocument: async () => 'extracted',
        extractFromImage: async () => 'extracted',
      };

      expect(validateProvider(provider)).toBe(true);
    });

    it('should return false for null', () => {
      expect(validateProvider(null)).toBe(false);
    });

    it('should return false for object missing methods', () => {
      const provider = {
        complete: async () => ({ content: 'test' }),
        // missing other methods
      };

      expect(validateProvider(provider)).toBe(false);
    });

    it('should return false for non-function methods', () => {
      const provider = {
        complete: 'not a function',
        supportedDocumentFormats: () => ['pdf'],
        supportedImageFormats: () => ['png'],
        maxDocumentPages: () => 100,
        maxImageResolution: () => 4096,
        extractFromDocument: async () => 'extracted',
        extractFromImage: async () => 'extracted',
      };

      expect(validateProvider(provider)).toBe(false);
    });
  });

  describe('estimateCostPerMillionTokens', () => {
    it('should return Anthropic pricing', () => {
      expect(estimateCostPerMillionTokens('anthropic', 'claude-opus-4')).toBe(15);
      expect(estimateCostPerMillionTokens('anthropic', 'claude-sonnet-4')).toBe(3);
      expect(estimateCostPerMillionTokens('anthropic', 'claude-haiku-3')).toBe(0.25);
    });

    it('should return OpenAI pricing', () => {
      expect(estimateCostPerMillionTokens('openai', 'gpt-4o')).toBe(5);
      expect(estimateCostPerMillionTokens('openai', 'gpt-4o-mini')).toBe(0.15);
    });

    it('should return Google pricing', () => {
      expect(estimateCostPerMillionTokens('google', 'gemini-1.5-pro')).toBe(1.25);
      expect(estimateCostPerMillionTokens('google', 'gemini-1.5-flash')).toBe(0.075);
    });

    it('should return default for unknown provider/model', () => {
      expect(estimateCostPerMillionTokens('unknown', 'unknown')).toBe(5);
    });
  });

  describe('DEFAULT_COMPLETION_OPTIONS', () => {
    it('should have correct defaults', () => {
      expect(DEFAULT_COMPLETION_OPTIONS.temperature).toBe(0.7);
      expect(DEFAULT_COMPLETION_OPTIONS.max_tokens).toBe(4096);
    });
  });
});
