import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicProvider, createAnthropicProvider } from './anthropic.js';

const { mockCreate, mockAnthropic } = vi.hoisted(() => {
  const mockCreate = vi.fn();
  const mockAnthropic = vi.fn().mockReturnValue({
    messages: {
      create: mockCreate,
    },
  });
  return { mockCreate, mockAnthropic };
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: mockAnthropic,
}));

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockReset();
    mockAnthropic.mockReturnValue({
      messages: {
        create: mockCreate,
      },
    });
    provider = new AnthropicProvider('test-api-key', 'claude-test-model');
  });

  describe('constructor', () => {
    it('should create provider with API key and default model', () => {
      const p = new AnthropicProvider('key', 'claude-sonnet-4');
      expect(p).toBeInstanceOf(AnthropicProvider);
    });
  });

  describe('complete', () => {
    it('should send completion request', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Hello, world!' }],
        usage: { input_tokens: 10, output_tokens: 20 },
        model: 'claude-test-model',
        stop_reason: 'end_turn',
      });

      const result = await provider.complete([{ role: 'user', content: 'Hi' }]);

      expect(result.content).toBe('Hello, world!');
      expect(result.usage?.input_tokens).toBe(10);
      expect(result.usage?.output_tokens).toBe(20);
    });

    it('should pass options to API', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'test' }],
        usage: { input_tokens: 5, output_tokens: 5 },
        model: 'claude-test-model',
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

    it('should use system prompt from options', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'test' }],
        usage: { input_tokens: 5, output_tokens: 5 },
        model: 'claude-test-model',
      });

      await provider.complete([{ role: 'user', content: 'test' }], {
        system: 'You are a helpful assistant.',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are a helpful assistant.',
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
      expect(formats).toContain('jpeg');
    });
  });

  describe('maxDocumentPages', () => {
    it('should return 100', () => {
      expect(provider.maxDocumentPages()).toBe(100);
    });
  });

  describe('maxImageResolution', () => {
    it('should return 1568', () => {
      expect(provider.maxImageResolution()).toBe(1568);
    });
  });

  describe('extractFromDocument', () => {
    it('should extract from PDF document', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Extracted text from PDF' }],
        usage: { input_tokens: 100, output_tokens: 50 },
        model: 'claude-test-model',
      });

      const buffer = Buffer.from('PDF content');
      const result = await provider.extractFromDocument(buffer, 'pdf', 'Extract text');

      expect(result).toBe('Extracted text from PDF');
      expect(mockCreate).toHaveBeenCalled();
    });
  });

  describe('extractFromImage', () => {
    it('should extract from image', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Extracted text from image' }],
        usage: { input_tokens: 100, output_tokens: 50 },
        model: 'claude-test-model',
      });

      const buffer = Buffer.from('PNG content');
      const result = await provider.extractFromImage(buffer, 'What is in this image?');

      expect(result).toBe('Extracted text from image');
    });
  });
});

describe('createAnthropicProvider', () => {
  it('should throw if ANTHROPIC_API_KEY is not set', () => {
    const originalEnv = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    expect(() => createAnthropicProvider()).toThrow('ANTHROPIC_API_KEY environment variable is required');

    process.env.ANTHROPIC_API_KEY = originalEnv;
  });

  it('should create provider when API key is set', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const provider = createAnthropicProvider('claude-test');
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });
});
