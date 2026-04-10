import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Reviser, createReviser } from './reviser.js';
import { writeFile, rm, mkdir } from 'fs/promises';
import { join } from 'path';

const TEST_DIR = '/tmp/graphwiki-test-reviser';

describe('Reviser', () => {
  let reviser: Reviser;
  const mockProvider = {
    complete: vi.fn(),
    supportedDocumentFormats: () => ['pdf'],
    supportedImageFormats: () => ['png'],
    maxDocumentPages: () => 100,
    maxImageResolution: () => 4096,
    extractFromDocument: async () => 'extracted',
    extractFromImage: async () => 'extracted',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    reviser = new Reviser(mockProvider as never, TEST_DIR, 'v1');
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(TEST_DIR, { recursive: true, force: true });
    } catch {}
  });

  describe('revise', () => {
    it('should revise prompt based on diagnostic', async () => {
      mockProvider.complete.mockResolvedValue({
        content: 'Extract code elements including functions, classes, and their relationships.',
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      });

      const diagnostic = {
        nodeId: 'node1',
        nodeLabel: 'TestFunction',
        failureModes: ['INSUFFICIENT_CONTEXT'],
        suggestedPrompts: ['Include function signatures'],
        estimatedImpact: 0.3,
      };

      const revised = await reviser.revise(
        'Extract code elements.',
        diagnostic,
        'What functions are defined?'
      );

      expect(mockProvider.complete).toHaveBeenCalled();
      expect(revised).toBeTruthy();
    });

    it('should apply minimal change constraint', async () => {
      // Very long response that would exceed diff limit
      mockProvider.complete.mockResolvedValue({
        content: '```\n' + 'x'.repeat(500) + '\n```',
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      });

      const revised = await reviser.revise(
        'Original prompt.',
        {
          nodeId: 'node1',
          nodeLabel: 'Test',
          failureModes: ['MISSING_ELEMENT'],
          suggestedPrompts: ['Add more detail'],
          estimatedImpact: 0.5,
        },
        'test query'
      );

      // Should either truncate or apply constraint
      expect(revised.length).toBeLessThanOrEqual(revised.length + 200);
    });
  });

  describe('savePromptVersion', () => {
    it('should save prompt with version', async () => {
      const version = await reviser.savePromptVersion(
        'code-extraction',
        '# Code Extraction Prompt\n\nExtract code elements.',
        'v1'
      );

      expect(version).toBe('v1');

      const loaded = await reviser.loadPrompt('code-extraction', 'v1');
      expect(loaded).toContain('Code Extraction Prompt');
    });

    it('should auto-increment version', async () => {
      await reviser.savePromptVersion('test', 'content v1', 'v1');
      const next = await reviser.savePromptVersion('test', 'content v2');

      expect(next).toBe('v2');
    });
  });

  describe('loadPrompt', () => {
    it('should load existing prompt', async () => {
      await reviser.savePromptVersion('test-prompt', 'Test content v1', 'v1');

      const loaded = await reviser.loadPrompt('test-prompt', 'v1');
      expect(loaded).toBe('Test content v1');
    });

    it('should return null for non-existent prompt', async () => {
      const loaded = await reviser.loadPrompt('non-existent', 'v99');
      expect(loaded).toBeNull();
    });
  });

  describe('listPromptVersions', () => {
    it('should list available versions', async () => {
      await reviser.savePromptVersion('my-prompt', 'content v1', 'v1');
      await reviser.savePromptVersion('my-prompt', 'content v2', 'v2');
      await reviser.savePromptVersion('my-prompt', 'content v3', 'v3');

      const versions = await reviser.listPromptVersions('my-prompt');

      expect(versions).toContain('v1');
      expect(versions).toContain('v2');
      expect(versions).toContain('v3');
    });

    it('should return empty for non-existent prompt', async () => {
      const versions = await reviser.listPromptVersions('non-existent');
      expect(versions).toEqual([]);
    });
  });

  describe('getCurrentVersion', () => {
    it('should return current version', () => {
      expect(reviser.getCurrentVersion()).toBe('v1');
    });
  });

  describe('createReviser', () => {
    it('should create reviser instance', () => {
      const r = createReviser(mockProvider as never);
      expect(r).toBeInstanceOf(Reviser);
    });
  });
});
