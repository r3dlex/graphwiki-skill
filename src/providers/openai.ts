// OpenAI provider for GraphWiki v2

import OpenAI from 'openai';
import type { Message, CompletionOptions, CompletionResult } from '../types.js';
import type { LLMProvider } from './provider.js';

/**
 * OpenAI LLM Provider
 */
export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey?: string, defaultModel = 'gpt-4o') {
    this.client = new OpenAI({ apiKey });
    this.defaultModel = defaultModel;
  }

  async complete(messages: Message[], options: CompletionOptions = {}): Promise<CompletionResult> {
    const model = options.model ?? this.defaultModel;

    const response = await this.client.chat.completions.create({
      model,
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      max_tokens: options.max_tokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      top_p: options.top_p,
      stop: options.stop_sequences,
    });

    const usage = response.usage;
    return {
      content: response.choices[0]?.message?.content ?? '',
      usage: {
        input_tokens: usage?.prompt_tokens ?? 0,
        output_tokens: usage?.completion_tokens ?? 0,
        total_tokens: usage?.total_tokens ?? 0,
      },
      model: response.model,
      stop_reason: response.choices[0]?.finish_reason ?? undefined,
    };
  }

  supportedDocumentFormats(): string[] {
    // OpenAI GPT-4o supports document upload
    return ['pdf', 'docx', 'txt', 'csv', 'md'];
  }

  supportedImageFormats(): string[] {
    return ['png', 'jpg', 'jpeg', 'gif', 'webp'];
  }

  maxDocumentPages(): number {
    return 100;
  }

  maxImageResolution(): number {
    return 2048; // 2048 x 2048 max for GPT-4o vision
  }

  async extractFromDocument(content: Buffer, format: string, prompt: string): Promise<string> {
    const base64Content = content.toString('base64');
    const mediaType = this.getMediaType(format);

    const response = await this.client.chat.completions.create({
      model: this.defaultModel,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                filename: `document.${format}`,
                file_data: `data:${mediaType};base64,${base64Content}`,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
      max_tokens: 4096,
    });

    return response.choices[0]?.message?.content ?? '';
  }

  async extractFromImage(content: Buffer, prompt: string): Promise<string> {
    const base64Content = content.toString('base64');

    const response = await this.client.chat.completions.create({
      model: this.defaultModel,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Content}`,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
      max_tokens: 4096,
    });

    return response.choices[0]?.message?.content ?? '';
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
 * Create an OpenAI provider with API key from environment
 */
export function createOpenAIProvider(defaultModel?: string): OpenAIProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }
  return new OpenAIProvider(apiKey, defaultModel);
}
