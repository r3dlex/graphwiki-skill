import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatePreToolUseHook, generateHookConfig, installPreToolUseHook } from './pre-tool-use.js';
import { writeFile, mkdir } from 'fs/promises';

vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

describe('pre-tool-use hook generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generatePreToolUseHook', () => {
    it('writes hook file to output path', async () => {
      await generatePreToolUseHook('/tmp/test-hook.js');
      expect(writeFile).toHaveBeenCalled();
    });

    it('generates hook with all options enabled by default', async () => {
      await generatePreToolUseHook('/tmp/test-hook.js');
      const call = (writeFile as any).mock.calls[0];
      const content = call[1];
      expect(content).toContain('preToolUse');
      expect(content).toContain('GRAPHWIKI_STATE');
    });

    it('generates hook with graph lookup disabled', async () => {
      await generatePreToolUseHook('/tmp/test-hook.js', { enableGraphLookup: false });
      expect(writeFile).toHaveBeenCalled();
    });

    it('generates hook with token tracking disabled', async () => {
      await generatePreToolUseHook('/tmp/test-hook.js', { enableTokenTracking: false });
      expect(writeFile).toHaveBeenCalled();
    });

    it('generates hook with context enrichment disabled', async () => {
      await generatePreToolUseHook('/tmp/test-hook.js', { enableContextEnrichment: false });
      expect(writeFile).toHaveBeenCalled();
    });
  });

  describe('generateHookConfig', () => {
    it('writes hook config JSON', async () => {
      await generateHookConfig('/tmp/hooks', '/tmp/hooks/graphwiki-pre-tool-use.js');
      expect(mkdir).toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalledWith(
        '/tmp/hooks/graphwiki-hooks.json',
        expect.stringContaining('pre-tool-use'),
        'utf-8'
      );
    });
  });

  describe('installPreToolUseHook', () => {
    it('installs hook with default options', async () => {
      await installPreToolUseHook('/tmp', {});
      // Should have called writeFile twice: once for hook, once for config
      expect((writeFile as any).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
