// Anthropic provider for GraphWiki v2
// Uses @anthropic-ai/sdk

import Anthropic from '@anthropic-ai/sdk';
import type { Message, CompletionOptions, CompletionResult } from '../types.js';
import type { LLMProvider } from './provider.js';

/**
 * Anthropic LLM Provider
 */
export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private defaultModel: string;

  constructor(apiKey?: string, defaultModel = 'claude-sonnet-4-20250514') {
    this.client = new Anthropic({ apiKey });
    this.defaultModel = defaultModel;
  }

  async complete(messages: Message[], options: CompletionOptions = {}): Promise<CompletionResult> {
    const model = options.model ?? this.defaultModel;

    const response = await this.client.messages.create({
      model,
      max_tokens: options.max_tokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      top_p: options.top_p,
      stop_sequences: options.stop_sequences,
      system: options.system,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        name: m.name,
      })),
    });

    return {
      content: response.content[0].type === 'text' ? response.content[0].text : '',
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      model: response.model,
      stop_reason: response.stop_reason ?? undefined,
    };
  }

  supportedDocumentFormats(): string[] {
    // Claude supports PDF and images natively
    return ['pdf', 'docx', 'txt', 'csv', 'md'];
  }

  supportedImageFormats(): string[] {
    return ['png', 'jpg', 'jpeg', 'gif', 'webp'];
  }

  maxDocumentPages(): number {
    return 100;
  }

  maxImageResolution(): number {
    return 1568; // 1568 x 1568 max dimension for Claude
  }

  async extractFromDocument(content: Buffer, format: string, prompt: string): Promise<string> {
    const base64Content = content.toString('base64');
    const mediaType = this.getMediaType(format);

    const response = await this.client.messages.create({
      model: this.defaultModel,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Content,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    });

    return response.content[0].type === 'text' ? response.content[0].text : '';
  }

  async extractFromImage(content: Buffer, prompt: string): Promise<string> {
    const base64Content = content.toString('base64');

    const response = await this.client.messages.create({
      model: this.defaultModel,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Content,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    });

    return response.content[0].type === 'text' ? response.content[0].text : '';
  }

  private getMediaType(format: string): string {
    const mediaTypes: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt: 'text/plain',
      csv: 'text/csv',
      md: 'text/markdown',
    };
    return mediaTypes[format.toLowerCase()] ?? 'application/octet-stream';
  }
}

/**
 * Create an Anthropic provider with API key from environment
 */
export function createAnthropicProvider(defaultModel?: string): AnthropicProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }
  return new AnthropicProvider(apiKey, defaultModel);
}
