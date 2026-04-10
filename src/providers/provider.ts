// LLM Provider interface for GraphWiki v2

import type { Message, CompletionOptions, CompletionResult } from '../types.js';

/**
 * LLM Provider interface
 * All LLM providers (Anthropic, OpenAI, Google) must implement this interface
 */
export interface LLMProvider {
  /**
   * Send a completion request to the LLM
   */
  complete(messages: Message[], options: CompletionOptions): Promise<CompletionResult>;

  /**
   * Get list of supported document formats for extraction
   */
  supportedDocumentFormats(): string[];

  /**
   * Get list of supported image formats for extraction
   */
  supportedImageFormats(): string[];

  /**
   * Get maximum number of document pages supported
   */
  maxDocumentPages(): number;

  /**
   * Get maximum image resolution supported
   */
  maxImageResolution(): number;

  /**
   * Extract structured information from a document
   */
  extractFromDocument(content: Buffer, format: string, prompt: string): Promise<string>;

  /**
   * Extract structured information from an image
   */
  extractFromImage(content: Buffer, prompt: string): Promise<string>;
}

/**
 * Default completion options
 */
export const DEFAULT_COMPLETION_OPTIONS: Partial<CompletionOptions> = {
  temperature: 0.7,
  max_tokens: 4096,
};

/**
 * Validate that a provider implements the LLMProvider interface
 */
export function validateProvider(provider: unknown): provider is LLMProvider {
  if (typeof provider !== 'object' || provider === null) {
    return false;
  }

  const p = provider as Record<string, unknown>;

  return (
    typeof p.complete === 'function' &&
    typeof p.supportedDocumentFormats === 'function' &&
    typeof p.supportedImageFormats === 'function' &&
    typeof p.maxDocumentPages === 'function' &&
    typeof p.maxImageResolution === 'function' &&
    typeof p.extractFromDocument === 'function' &&
    typeof p.extractFromImage === 'function'
  );
}

/**
 * Estimate cost per 1M tokens based on provider and model
 */
export function estimateCostPerMillionTokens(provider: string, model: string): number {
  const pricing: Record<string, Record<string, number>> = {
    anthropic: {
      'claude-opus-4': 15,
      'claude-sonnet-4': 3,
      'claude-haiku-3': 0.25,
    },
    openai: {
      'gpt-4o': 5,
      'gpt-4o-mini': 0.15,
      'gpt-4-turbo': 10,
    },
    google: {
      'gemini-1.5-pro': 1.25,
      'gemini-1.5-flash': 0.075,
    },
  };

  return pricing[provider]?.[model] ?? 5;
}
