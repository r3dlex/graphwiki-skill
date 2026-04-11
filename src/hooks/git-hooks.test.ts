// Tests for git-hooks.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { writeFile, mkdir } from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// Mock child_process
const mockExec = vi.fn();
vi.mock('child_process', () => ({
  exec: mockExec,
}));

describe('git-hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExec.mockReset();
  });

  describe('installGitHooks', () => {
    it('should create hooks directory and install hooks', async () => {
      const { installGitHooks } = await import('./git-hooks.js');

      await installGitHooks('/mock/git', '/mock/git/hooks');

      expect(mkdir).toHaveBeenCalledWith('/mock/git/hooks', { recursive: true });
      expect(writeFile).toHaveBeenCalledTimes(2);
    });

    it('should write post-commit hook with correct content', async () => {
      const { installGitHooks } = await import('./git-hooks.js');

      await installGitHooks('/mock/git', '/mock/git/hooks');

      const postCommitCall = vi.mocked(writeFile).mock.calls.find(
        c => (c[0] as string).endsWith('post-commit')
      );
      expect(postCommitCall).toBeDefined();
      const content = postCommitCall![1] as string;
      expect(content).toContain('#!/bin/bash');
      expect(content).toContain('graphwiki build');
      expect(content).toContain('$GIT_HOOK_COMMAND');
    });

    it('should write post-checkout hook with correct content', async () => {
      const { installGitHooks } = await import('./git-hooks.js');

      await installGitHooks('/mock/git', '/mock/git/hooks');

      const postCheckoutCall = vi.mocked(writeFile).mock.calls.find(
        c => (c[0] as string).endsWith('post-checkout')
      );
      expect(postCheckoutCall).toBeDefined();
      const content = postCheckoutCall![1] as string;
      expect(content).toContain('#!/bin/bash');
      expect(content).toContain('PREV_BRANCH=');
      expect(content).toContain('NEW_BRANCH=');
    });

    it('should configure git hooksPath in git config', async () => {
      const { installGitHooks } = await import('./git-hooks.js');

      await installGitHooks('/mock/git', '/mock/git/hooks');

      expect(mockExec).toHaveBeenCalled();
      const execCall = mockExec.mock.calls[0]![0] as string;
      expect(execCall).toContain('git config core.hooksPath');
      expect(execCall).toContain('/mock/git/hooks');
    });

    it('should handle git config error gracefully', async () => {
      const { installGitHooks } = await import('./git-hooks.js');
      mockExec.mockImplementationOnce((_cmd: string, cb: (err: Error | null) => void) => {
        cb(new Error('git error'));
      });

      // Should not throw
      await expect(installGitHooks('/mock/git', '/mock/git/hooks')).resolves.not.toThrow();
    });
  });

  describe('uninstallGitHooks', () => {
    it('should unset git hooksPath', async () => {
      const { uninstallGitHooks } = await import('./git-hooks.js');

      await uninstallGitHooks('/mock/git');

      expect(mockExec).toHaveBeenCalled();
      const execCall = mockExec.mock.calls[0]![0] as string;
      expect(execCall).toContain('git config --unset core.hooksPath');
    });

    it('should handle errors gracefully', async () => {
      const { uninstallGitHooks } = await import('./git-hooks.js');
      mockExec.mockRejectedValueOnce(new Error('exec error'));

      await expect(uninstallGitHooks('/mock/git')).resolves.not.toThrow();
    });
  });

  describe('generatePostCommitHook', () => {
    it('should generate hook that checks for GIT_HOOK_COMMAND', async () => {
      const { installGitHooks } = await import('./git-hooks.js');

      await installGitHooks('/mock/git', '/mock/git/hooks');

      const postCommitCall = vi.mocked(writeFile).mock.calls.find(
        c => (c[0] as string).endsWith('post-commit')
      );
      const content = postCommitCall![1] as string;
      expect(content).toContain('[[ "$GIT_HOOK_COMMAND" != "commit"* ]]');
    });

    it('should generate hook that only runs on actual commits', async () => {
      const { installGitHooks } = await import('./git-hooks.js');

      await installGitHooks('/mock/git', '/mock/git/hooks');

      const postCommitCall = vi.mocked(writeFile).mock.calls.find(
        c => (c[0] as string).endsWith('post-commit')
      );
      const content = postCommitCall![1] as string;
      expect(content).toContain('exit 0');
    });
  });

  describe('generatePostCheckoutHook', () => {
    it('should skip refresh for new branch creation', async () => {
      const { installGitHooks } = await import('./git-hooks.js');

      await installGitHooks('/mock/git', '/mock/git/hooks');

      const postCheckoutCall = vi.mocked(writeFile).mock.calls.find(
        c => (c[0] as string).endsWith('post-checkout')
      );
      const content = postCheckoutCall![1] as string;
      // Check for new branch detection (00000000 commit hash)
      expect(content).toContain('0000000000000000000000000000000000000000');
    });

    it('should check for wiki directory existence', async () => {
      const { installGitHooks } = await import('./git-hooks.js');

      await installGitHooks('/mock/git', '/mock/git/hooks');

      const postCheckoutCall = vi.mocked(writeFile).mock.calls.find(
        c => (c[0] as string).endsWith('post-checkout')
      );
      const content = postCheckoutCall![1] as string;
      expect(content).toContain('[[ ! -d "wiki" ]]');
    });
  });
});
