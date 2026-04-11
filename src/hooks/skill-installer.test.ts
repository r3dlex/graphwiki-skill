// Tests for skill-installer.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  access: vi.fn(),
}));

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

// Mock skill-generator
vi.mock('./skill-generator.js', () => ({
  generateHooksJsonEntries: vi.fn(() =>
    JSON.stringify({
      hooks: {
        pre_tool_use: [
          {
            matcher: 'read',
            hooks: [{ type: 'command', command: 'graphwiki-pretool' }],
          },
        ],
        session_start: [
          {
            matcher: '*',
            hooks: [{ type: 'command', command: 'graphwiki-session-start' }],
          },
        ],
        post_tool_use: [
          {
            matcher: 'read',
            hooks: [{ type: 'command', command: 'graphwiki-posttool' }],
          },
        ],
      },
    })
  ),
}));

describe('skill-installer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectPlatform', () => {
    it('should detect claude platform when settings.json exists', async () => {
      const { detectPlatform } = await import('./skill-installer.js');
      vi.mocked(vi.mocked(await import('fs/promises')).access)
        .mockResolvedValueOnce(undefined as never)
        .mockRejectedValueOnce(new Error('not found'));
      Object.defineProperty(process, 'env', {
        value: {
          HOME: '/home/user',
          ANTHROPIC_API_KEY: undefined,
          OPENAI_API_KEY: undefined,
          GOOGLE_API_KEY: undefined,
        },
        writable: true,
      });

      const platform = await detectPlatform();
      expect(platform).toBe('claude');
    });

    it('should detect cursor platform when cursor settings exist', async () => {
      const { detectPlatform } = await import('./skill-installer.js');
      vi.mocked(vi.mocked(await import('fs/promises')).access)
        .mockRejectedValueOnce(new Error('not claude'))
        .mockResolvedValueOnce(undefined as never);
      Object.defineProperty(process, 'env', {
        value: {
          HOME: '/home/user',
          ANTHROPIC_API_KEY: undefined,
          OPENAI_API_KEY: undefined,
          GOOGLE_API_KEY: undefined,
        },
        writable: true,
      });

      const platform = await detectPlatform();
      expect(platform).toBe('cursor');
    });

    it('should default to claude when no platform detected', async () => {
      const { detectPlatform } = await import('./skill-installer.js');
      vi.mocked(vi.mocked(await import('fs/promises')).access).mockRejectedValue(new Error('not found'));
      Object.defineProperty(process, 'env', {
        value: {
          HOME: '/home/user',
          ANTHROPIC_API_KEY: undefined,
          OPENAI_API_KEY: undefined,
          GOOGLE_API_KEY: undefined,
        },
        writable: true,
      });

      const platform = await detectPlatform();
      expect(platform).toBe('claude');
    });

    it('should detect codex by OPENAI_API_KEY', async () => {
      const { detectPlatform } = await import('./skill-installer.js');
      vi.mocked(vi.mocked(await import('fs/promises')).access).mockRejectedValue(new Error('not found'));
      Object.defineProperty(process, 'env', {
        value: {
          HOME: '/home/user',
          ANTHROPIC_API_KEY: undefined,
          OPENAI_API_KEY: 'sk-test',
          GOOGLE_API_KEY: undefined,
        },
        writable: true,
      });

      const platform = await detectPlatform();
      expect(platform).toBe('codex');
    });

    it('should detect gemini by GOOGLE_API_KEY', async () => {
      const { detectPlatform } = await import('./skill-installer.js');
      vi.mocked(vi.mocked(await import('fs/promises')).access).mockRejectedValue(new Error('not found'));
      Object.defineProperty(process, 'env', {
        value: {
          HOME: '/home/user',
          ANTHROPIC_API_KEY: undefined,
          OPENAI_API_KEY: undefined,
          GOOGLE_API_KEY: 'google-key',
        },
        writable: true,
      });

      const platform = await detectPlatform();
      expect(platform).toBe('gemini');
    });
  });

  describe('installHook', () => {
    it('should create hooks directory and write hooks.json', async () => {
      const { installHook } = await import('./skill-installer.js');
      vi.mocked(vi.mocked(await import('fs/promises')).readFile).mockRejectedValue(new Error('not found'));
      Object.defineProperty(process, 'env', {
        value: { HOME: '/home/user' },
        writable: true,
      });

      await installHook();

      expect(vi.mocked(await import('fs/promises')).mkdir).toHaveBeenCalled();
      expect(vi.mocked(await import('fs/promises')).writeFile).toHaveBeenCalled();
    });

    it('should merge with existing hooks.json', async () => {
      const { installHook } = await import('./skill-installer.js');
      const existingHooks = {
        hooks: {
          pre_tool_use: [
            {
              matcher: 'read',
              hooks: [{ type: 'command', command: 'existing-hook' }],
            },
          ],
        },
      };
      vi.mocked(vi.mocked(await import('fs/promises')).readFile).mockResolvedValue(JSON.stringify(existingHooks));
      Object.defineProperty(process, 'env', {
        value: { HOME: '/home/user' },
        writable: true,
      });

      await installHook();

      expect(vi.mocked(await import('fs/promises')).writeFile).toHaveBeenCalled();
      const writtenContent = vi.mocked(vi.mocked(await import('fs/promises')).writeFile).mock.calls[0]![1] as string;
      const parsed = JSON.parse(writtenContent);
      // Should contain both existing and new hooks
      expect(parsed.hooks.pre_tool_use).toBeDefined();
    });
  });

  describe('uninstallHook', () => {
    it('should remove graphwiki hooks from hooks.json', async () => {
      const { uninstallHook } = await import('./skill-installer.js');
      const existingHooks = {
        hooks: {
          pre_tool_use: [
            {
              matcher: 'read',
              hooks: [
                { type: 'command', command: 'graphwiki-pretool' },
                { type: 'command', command: 'other-hook' },
              ],
            },
          ],
        },
      };
      vi.mocked(vi.mocked(await import('fs/promises')).readFile).mockResolvedValue(JSON.stringify(existingHooks));
      Object.defineProperty(process, 'env', {
        value: { HOME: '/home/user' },
        writable: true,
      });

      await uninstallHook();

      expect(vi.mocked(await import('fs/promises')).writeFile).toHaveBeenCalled();
    });

    it('should handle missing hooks.json gracefully', async () => {
      const { uninstallHook } = await import('./skill-installer.js');
      vi.mocked(vi.mocked(await import('fs/promises')).readFile).mockRejectedValue(new Error('not found'));
      Object.defineProperty(process, 'env', {
        value: { HOME: '/home/user' },
        writable: true,
      });

      await expect(uninstallHook()).resolves.not.toThrow();
    });
  });

  describe('installSkill', () => {
    it('should install claude skill correctly', async () => {
      const { installSkill } = await import('./skill-installer.js');
      Object.defineProperty(process, 'env', {
        value: { HOME: '/home/user' },
        writable: true,
      });

      await installSkill('claude');

      expect(vi.mocked(await import('fs/promises')).mkdir).toHaveBeenCalled();
      expect(vi.mocked(await import('fs/promises')).writeFile).toHaveBeenCalled();
    });

    it('should install codex skill correctly', async () => {
      const { installSkill } = await import('./skill-installer.js');
      Object.defineProperty(process, 'env', {
        value: { HOME: '/home/user', PATH: '/usr/bin' },
        writable: true,
      });

      await installSkill('codex');

      expect(vi.mocked(await import('fs/promises')).mkdir).toHaveBeenCalled();
      expect(vi.mocked(await import('fs/promises')).writeFile).toHaveBeenCalled();
    });

    it('should install gemini skill correctly', async () => {
      const { installSkill } = await import('./skill-installer.js');
      Object.defineProperty(process, 'env', {
        value: { HOME: '/home/user', PATH: '/usr/bin' },
        writable: true,
      });

      await installSkill('gemini');

      expect(vi.mocked(await import('fs/promises')).mkdir).toHaveBeenCalled();
      expect(vi.mocked(await import('fs/promises')).writeFile).toHaveBeenCalled();
    });

    it('should install cursor skill with JSON format', async () => {
      const { installSkill } = await import('./skill-installer.js');
      Object.defineProperty(process, 'env', {
        value: { HOME: '/home/user', PATH: '/usr/bin' },
        writable: true,
      });

      await installSkill('cursor');

      const call = vi.mocked(vi.mocked(await import('fs/promises')).writeFile).mock.calls.find(
        c => (c[0] as string).includes('graphwiki.json')
      );
      expect(call).toBeDefined();
      const content = call![1] as string;
      const parsed = JSON.parse(content);
      expect(parsed.name).toBe('GraphWiki');
    });

    it('should install openclaw skill with YAML format', async () => {
      const { installSkill } = await import('./skill-installer.js');
      Object.defineProperty(process, 'env', {
        value: { HOME: '/home/user', PATH: '/usr/bin' },
        writable: true,
      });

      await installSkill('openclaw');

      expect(vi.mocked(await import('fs/promises')).mkdir).toHaveBeenCalled();
      expect(vi.mocked(await import('fs/promises')).writeFile).toHaveBeenCalled();
    });

    it('should install auggie skill with YAML frontmatter format', async () => {
      const { installSkill } = await import('./skill-installer.js');
      Object.defineProperty(process, 'env', {
        value: { HOME: '/home/user', PATH: '/usr/bin' },
        writable: true,
      });

      await installSkill('auggie');

      expect(vi.mocked(await import('fs/promises')).mkdir).toHaveBeenCalled();
      expect(vi.mocked(await import('fs/promises')).writeFile).toHaveBeenCalled();
      // Verify YAML frontmatter format
      const call = vi.mocked(vi.mocked(await import('fs/promises')).writeFile).mock.calls.find(
        c => (c[0] as string).includes('SKILL.md')
      );
      expect(call).toBeDefined();
      const content = call![1] as string;
      expect(content).toContain('---');
      expect(content).toContain('name: graphwiki');
    });

    it('should use custom installPath when provided', async () => {
      const { installSkill } = await import('./skill-installer.js');
      Object.defineProperty(process, 'env', {
        value: { HOME: '/home/user', PATH: '/usr/bin' },
        writable: true,
      });

      await installSkill('codex', '/custom/path');

      expect(vi.mocked(await import('fs/promises')).mkdir).toHaveBeenCalledWith(
        '/custom/path',
        expect.any(Object)
      );
    });
  });

  describe('installAllSkills', () => {
    it('should install skills for detected platform', async () => {
      const { installAllSkills } = await import('./skill-installer.js');
      vi.mocked(vi.mocked(await import('fs/promises')).access).mockRejectedValue(new Error('not found'));
      Object.defineProperty(process, 'env', {
        value: { HOME: '/home/user', ANTHROPIC_API_KEY: 'test', PATH: '/usr/bin' },
        writable: true,
      });

      await installAllSkills();

      // Should have called mkdir and writeFile for claude skill
      expect(vi.mocked(await import('fs/promises')).mkdir).toHaveBeenCalled();
    });
  });

  describe('getSkillDefinition', () => {
    it('should return correct skill definition for claude', async () => {
      const { getSkillDefinition } = await import('./skill-installer.js');

      const claudeDef = getSkillDefinition('claude');
      expect(claudeDef.name).toBe('graphwiki');
      expect(claudeDef.tools).toContain('bash');
      expect(claudeDef.prompt).toContain('graphwiki');
    });

    it('should return correct skill definition for codex', async () => {
      const { getSkillDefinition } = await import('./skill-installer.js');

      const codexDef = getSkillDefinition('codex');
      expect(codexDef.name).toBe('graphwiki');
      expect(codexDef.description).toContain('Codex');
    });

    it('should return correct skill definition for gemini', async () => {
      const { getSkillDefinition } = await import('./skill-installer.js');

      const geminiDef = getSkillDefinition('gemini');
      expect(geminiDef.name).toBe('graphwiki');
      expect(geminiDef.prompt).toContain('GraphWiki Knowledge Graph');
    });

    it('should return correct skill definition for cursor', async () => {
      const { getSkillDefinition } = await import('./skill-installer.js');

      const cursorDef = getSkillDefinition('cursor');
      expect(cursorDef.name).toBe('GraphWiki');
      expect(cursorDef.description).toContain('Cursor');
    });

    it('should return correct skill definition for openclaw', async () => {
      const { getSkillDefinition } = await import('./skill-installer.js');

      const openclawDef = getSkillDefinition('openclaw');
      expect(openclawDef.name).toBe('graphwiki');
      expect(openclawDef.description).toContain('OpenClaw');
    });

    it('should return correct skill definition for auggie', async () => {
      const { getSkillDefinition } = await import('./skill-installer.js');

      const auggieDef = getSkillDefinition('auggie');
      expect(auggieDef.name).toBe('graphwiki');
      expect(auggieDef.prompt).toContain('Auggie');
    });
  });

  describe('installAll', () => {
    it('should install both skill and hooks', async () => {
      const { installAll } = await import('./skill-installer.js');
      vi.mocked(vi.mocked(await import('fs/promises')).access).mockRejectedValue(new Error('not found'));
      vi.mocked(vi.mocked(await import('fs/promises')).readFile).mockRejectedValue(new Error('not found'));
      Object.defineProperty(process, 'env', {
        value: { HOME: '/home/user', ANTHROPIC_API_KEY: 'test', PATH: '/usr/bin' },
        writable: true,
      });

      await installAll();

      // Both skill and hooks should be installed
      expect(vi.mocked(await import('fs/promises')).mkdir).toHaveBeenCalled();
    });
  });
});
