// Google provider for GraphWiki v2

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Message, CompletionOptions, CompletionResult } from '../types.js';
import type { LLMProvider } from './provider.js';

/**
 * Google Gemini LLM Provider
 */
export class GoogleProvider implements LLMProvider {
  private client: GoogleGenerativeAI;
  private defaultModel: string;

  constructor(apiKey?: string, defaultModel = 'gemini-1.5-pro') {
    this.client = new GoogleGenerativeAI(apiKey ?? process.env.GOOGLE_API_KEY ?? '');
    this.defaultModel = defaultModel;
  }

  async complete(messages: Message[], options: CompletionOptions = {}): Promise<CompletionResult> {
    const model = this.client.getGenerativeModel({ model: options.model ?? this.defaultModel });

    // Convert messages to Gemini format
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const generationConfig = {
      maxOutputTokens: options.max_tokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      topP: options.top_p,
      stopSequences: options.stop_sequences,
    };

    const response = await model.generateContent({
      contents,
      generationConfig,
      systemInstruction: options.system ? [{ text: options.system }] : undefined,
    });

    const usage = await response.raw?.promptFeedback;
    const text = response.response.text();

    return {
      content: text,
      usage: {
        // Gemini doesn't provide exact token counts in the same way
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
      model: options.model ?? this.defaultModel,
      stop_reason: 'stop' as const,
    };
  }

  supportedDocumentFormats(): string[] {
    // Gemini supports PDF and images natively
    return ['pdf', 'txt', 'csv', 'md'];
  }

  supportedImageFormats(): string[] {
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'webp'];
  }

  maxDocumentPages(): number {
    return 1000; // Gemini can handle very long documents
  }

  maxImageResolution(): number {
    return 2048; // 2048 x 2048 max for Gemini vision
  }

  async extractFromDocument(content: Buffer, format: string, prompt: string): Promise<string> {
    const model = this.client.getGenerativeModel({ model: this.defaultModel });

    const base64Content = content.toString('base64');
    const mimeType = this.getMimeType(format);

    const imagePart = {
      inlineData: {
        data: base64Content,
        mimeType,
      },
    };

    const result = await model.generateContent([imagePart, { text: prompt }]);
    return result.response.text();
  }

  async extractFromImage(content: Buffer, prompt: string): Promise<string> {
    const model = this.client.getGenerativeModel({ model: this.defaultModel });

    const base64Content = content.toString('base64');

    const imagePart = {
      inlineData: {
        data: base64Content,
        mimeType: 'image/png',
      },
    };

    const result = await model.generateContent([imagePart, { text: prompt }]);
    return result.response.text();
  }

  private getMimeType(format: string): string {
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      txt: 'text/plain',
      csv: 'text/csv',
      md: 'text/markdown',
    };
    return mimeTypes[format.toLowerCase()] ?? 'application/octet-stream';
  }
}

/**
 * Create a Google provider with API key from environment
 */
export function createGoogleProvider(defaultModel?: string): GoogleProvider {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY environment variable is required');
  }
  return new GoogleProvider(apiKey, defaultModel);
}
