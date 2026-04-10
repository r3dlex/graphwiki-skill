import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIProvider, createOpenAIProvider } from './openai.js';

const { mockCreate, mockOpenAI } = vi.hoisted(() => {
  const mockCreate = vi.fn();
  const mockOpenAI = vi.fn().mockReturnValue({
    chat: {
      completions: { create: mockCreate },
    },
  });
  return { mockCreate, mockOpenAI };
});

vi.mock('openai', () => ({
  default: mockOpenAI,
}));

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockReset();
    mockOpenAI.mockReturnValue({
      chat: {
        completions: { create: mockCreate },
      },
    });
    provider = new OpenAIProvider('test-api-key', 'gpt-4o-test');
  });

  describe('constructor', () => {
    it('should create provider with API key and default model', () => {
      const p = new OpenAIProvider('key', 'gpt-4o');
      expect(p).toBeInstanceOf(OpenAIProvider);
    });
  });

  describe('complete', () => {
    it('should send completion request', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Hello, world!' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4o-test',
      });

      const result = await provider.complete([{ role: 'user', content: 'Hi' }]);

      expect(result.content).toBe('Hello, world!');
      expect(result.usage?.input_tokens).toBe(10);
      expect(result.usage?.output_tokens).toBe(20);
    });

    it('should pass options to API', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        model: 'gpt-4o-test',
      });

      await provider.complete([{ role: 'user', content: 'test' }], {
        max_tokens: 100,
        temperature: 0.5,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 100,
          temperature: 0.5,
        })
      );
    });
  });

  describe('supportedDocumentFormats', () => {
    it('should return supported formats', () => {
      const formats = provider.supportedDocumentFormats();
      expect(formats).toContain('pdf');
      expect(formats).toContain('docx');
    });
  });

  describe('supportedImageFormats', () => {
    it('should return supported image formats', () => {
      const formats = provider.supportedImageFormats();
      expect(formats).toContain('png');
      expect(formats).toContain('jpg');
    });
  });

  describe('maxDocumentPages', () => {
    it('should return 100', () => {
      expect(provider.maxDocumentPages()).toBe(100);
    });
  });

  describe('maxImageResolution', () => {
    it('should return 2048', () => {
      expect(provider.maxImageResolution()).toBe(2048);
    });
  });

  describe('extractFromDocument', () => {
    it('should extract from PDF document', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Extracted text from PDF' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        model: 'gpt-4o-test',
      });

      const buffer = Buffer.from('PDF content');
      const result = await provider.extractFromDocument(buffer, 'pdf', 'Extract text');

      expect(result).toBe('Extracted text from PDF');
    });
  });

  describe('extractFromImage', () => {
    it('should extract from image', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Extracted text from image' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        model: 'gpt-4o-test',
      });

      const buffer = Buffer.from('PNG content');
      const result = await provider.extractFromImage(buffer, 'What is in this image?');

      expect(result).toBe('Extracted text from image');
    });
  });
});

describe('createOpenAIProvider', () => {
  it('should throw if OPENAI_API_KEY is not set', () => {
    const originalEnv = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    expect(() => createOpenAIProvider()).toThrow('OPENAI_API_KEY environment variable is required');

    process.env.OPENAI_API_KEY = originalEnv;
  });

  it('should create provider when API key is set', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const provider = createOpenAIProvider('gpt-4o');
    expect(provider).toBeInstanceOf(OpenAIProvider);
  });
});
