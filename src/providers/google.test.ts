import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleProvider, createGoogleProvider } from './google.js';

// Use hoisted to create mocks that persist correctly in ESM
const { mockGenerateContent, mockGoogleGenerativeAI } = vi.hoisted(() => {
  const mockGenerateContent = vi.fn();
  const mockGoogleGenerativeAI = vi.fn().mockReturnValue({
    getGenerativeModel: () => ({
      generateContent: mockGenerateContent,
    }),
  });
  return { mockGenerateContent, mockGoogleGenerativeAI };
});

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: mockGoogleGenerativeAI,
}));

describe('GoogleProvider', () => {
  let provider: GoogleProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateContent.mockReset();
    mockGoogleGenerativeAI.mockReturnValue({
      getGenerativeModel: () => ({
        generateContent: mockGenerateContent,
      }),
    });
    provider = new GoogleProvider('test-api-key', 'gemini-test-model');
  });

  describe('constructor', () => {
    it('should create provider with API key and default model', () => {
      const p = new GoogleProvider('key', 'gemini-1.5-pro');
      expect(p).toBeInstanceOf(GoogleProvider);
    });

    it('should use GOOGLE_API_KEY from environment if no key provided', () => {
      process.env.GOOGLE_API_KEY = 'env-api-key';
      const p = new GoogleProvider();
      expect(p).toBeInstanceOf(GoogleProvider);
      delete process.env.GOOGLE_API_KEY;
    });
  });

  describe('complete', () => {
    it('should send completion request', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => 'Hello, world!',
        },
        raw: { promptFeedback: {} },
      });

      const result = await provider.complete([{ role: 'user', content: 'Hi' }]);

      expect(result.content).toBe('Hello, world!');
    });

    it('should pass options to API', async () => {
      mockGenerateContent.mockResolvedValue({
        response: { text: () => 'test' },
        raw: { promptFeedback: {} },
      });

      await provider.complete([{ role: 'user', content: 'test' }], {
        max_tokens: 100,
        temperature: 0.5,
      });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          generationConfig: expect.objectContaining({
            maxOutputTokens: 100,
            temperature: 0.5,
          }),
        })
      );
    });
  });

  describe('supportedDocumentFormats', () => {
    it('should return supported formats', () => {
      const formats = provider.supportedDocumentFormats();
      expect(formats).toContain('pdf');
      expect(formats).toContain('txt');
    });
  });

  describe('supportedImageFormats', () => {
    it('should return supported image formats', () => {
      const formats = provider.supportedImageFormats();
      expect(formats).toContain('png');
      expect(formats).toContain('jpg');
      expect(formats).toContain('webp');
    });
  });

  describe('maxDocumentPages', () => {
    it('should return 1000', () => {
      expect(provider.maxDocumentPages()).toBe(1000);
    });
  });

  describe('maxImageResolution', () => {
    it('should return 2048', () => {
      expect(provider.maxImageResolution()).toBe(2048);
    });
  });

  describe('extractFromDocument', () => {
    it('should extract from PDF document', async () => {
      mockGenerateContent.mockResolvedValue({
        response: { text: () => 'Extracted text from PDF' },
      });

      const buffer = Buffer.from('PDF content');
      const result = await provider.extractFromDocument(buffer, 'pdf', 'Extract text');

      expect(result).toBe('Extracted text from PDF');
    });
  });

  describe('extractFromImage', () => {
    it('should extract from image', async () => {
      mockGenerateContent.mockResolvedValue({
        response: { text: () => 'Extracted text from image' },
      });

      const buffer = Buffer.from('PNG content');
      const result = await provider.extractFromImage(buffer, 'What is in this image?');

      expect(result).toBe('Extracted text from image');
    });
  });
});

describe('createGoogleProvider', () => {
  it('should throw if GOOGLE_API_KEY is not set', () => {
    const originalEnv = process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    expect(() => createGoogleProvider()).toThrow('GOOGLE_API_KEY environment variable is required');

    process.env.GOOGLE_API_KEY = originalEnv;
  });

  it('should create provider when API key is set', () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    const provider = createGoogleProvider('gemini-1.5-pro');
    expect(provider).toBeInstanceOf(GoogleProvider);
  });
});
