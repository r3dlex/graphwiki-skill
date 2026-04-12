import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileWatcher } from './file-watcher.js';

const mockWatcher = {
  on: vi.fn().mockReturnThis(),
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => mockWatcher),
  },
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('{}'),
}));

vi.mock('glob', () => ({
  glob: vi.fn(() => Promise.resolve(['file1.ts', 'file2.ts'])),
}));

vi.mock('../util/ignore-resolver', () => ({
  resolveIgnores: vi.fn(() => Promise.resolve([
    ['node_modules', '.git'],
    { configJson: [], graphwikiignore: [], graphifyignore: [] },
  ])),
}));

describe('FileWatcher', () => {
  let watcher: FileWatcher;
  let onUpdate: ReturnType<typeof vi.fn>;
  let onError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onUpdate = vi.fn();
    onError = vi.fn();
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.stop();
    }
  });

  it('creates a FileWatcher instance', () => {
    watcher = new FileWatcher({
      path: '/test',
      onUpdate,
      onError,
    });
    expect(watcher).toBeDefined();
  });

  it('starts watching and discovers files', async () => {
    watcher = new FileWatcher({
      path: '/test',
      onUpdate,
      onError,
    });
    await watcher.start();
  });

  it('fires callback on add event via onEvent', async () => {
    watcher = new FileWatcher({
      path: '/test',
      onUpdate,
      onError,
    });
    await watcher.start();

    const watcherAny = watcher as any;
    watcherAny.onEvent('add', 'new-file.ts');

    await new Promise(r => setTimeout(r, 600));
    expect(onUpdate).toHaveBeenCalled();
  });

  it('stop() closes the watcher', async () => {
    watcher = new FileWatcher({
      path: '/test',
      onUpdate,
      onError,
    });
    await watcher.start();
    await watcher.stop();
  });

  it('handles missing graph file gracefully', async () => {
    const fs = await import('fs/promises');
    (fs.readFile as any).mockRejectedValueOnce(new Error('ENOENT'));

    watcher = new FileWatcher({
      path: '/test',
      onUpdate,
      onError,
    });
    await watcher.start();
  });

  // ── Watcher routing tests (4 required) ──────────────────────────────────

  // code-auto: .ts file change calls onUpdate
  it('code-auto: .ts file change calls onUpdate via flush()', async () => {
    watcher = new FileWatcher({ path: '/test', onUpdate, onError });
    await watcher.start();

    const watcherAny = watcher as any;
    watcherAny.onEvent('change', 'src/index.ts');
    await new Promise(r => setTimeout(r, 600));

    expect(onUpdate).toHaveBeenCalled();
  });

  // doc-notify-default: .md file change calls onNotify (not onUpdate) when autoDocs not set
  it('doc-notify-default: .md file change calls onNotify when autoDocs is not set', async () => {
    const onNotify = vi.fn();
    watcher = new FileWatcher({ path: '/test', onUpdate, onNotify, onError });
    await watcher.start();

    const watcherAny = watcher as any;
    watcherAny.onEvent('change', 'README.md');
    await new Promise(r => setTimeout(r, 600));

    expect(onNotify).toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  // doc-auto-with-flag: .md file change calls onUpdate when autoDocs is set
  it('doc-auto-with-flag: .md file change calls onUpdate when autoDocs is true', async () => {
    const onNotify = vi.fn();
    watcher = new FileWatcher({ path: '/test', onUpdate, onNotify, autoDocs: true, onError });
    await watcher.start();

    const watcherAny = watcher as any;
    watcherAny.onEvent('change', 'README.md');
    await new Promise(r => setTimeout(r, 600));

    expect(onUpdate).toHaveBeenCalled();
    expect(onNotify).not.toHaveBeenCalled();
  });

  // media-notify: .mp3 file change calls onNotify
  it('media-notify: .mp3 file change calls onNotify', async () => {
    const onNotify = vi.fn();
    watcher = new FileWatcher({ path: '/test', onUpdate, onNotify, onError });
    await watcher.start();

    const watcherAny = watcher as any;
    watcherAny.onEvent('change', 'podcast.mp3');
    await new Promise(r => setTimeout(r, 600));

    expect(onNotify).toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

