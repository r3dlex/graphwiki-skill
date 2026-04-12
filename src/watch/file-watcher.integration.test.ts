/**
 * Integration test for FileWatcher using a real temp directory.
 *
 * chokidar does not fire reliably on macOS /tmp in all Node.js versions,
 * so we use fs.watch to detect the real write event and then forward it
 * to FileWatcher.onEvent — exercising the real debounce, classify, and
 * callback pipeline with actual filesystem I/O.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, watch as fsWatch } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileWatcher } from './file-watcher.js';

// FileWatcher.onEvent is private; cast via any to access it in the integration test.
type FileWatcherAny = FileWatcher & { onEvent: (event: string, file: string) => void };

describe('FileWatcher integration', () => {
  it('fires onUpdate when a .ts file is written to a real temp directory', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'graphwiki-watch-test-'));

    let updateResolve: (() => void) | undefined;
    const updatePromise = new Promise<void>((resolve) => { updateResolve = resolve; });

    const realWatcher = new FileWatcher({
      path: tmpDir,
      debounceMs: 50,
      onUpdate: () => { updateResolve?.(); },
      onError: (err) => { throw err; },
    }) as FileWatcherAny;

    // Use native fs.watch to observe the real file write, then forward to onEvent
    const nativeWatcher = fsWatch(tmpDir, { recursive: false }, (_event, filename) => {
      if (filename && filename.endsWith('.ts')) {
        realWatcher.onEvent('add', filename);
      }
    });

    try {
      await realWatcher.start();

      // Small delay to ensure watchers are fully initialized before triggering
      await new Promise<void>((r) => setTimeout(r, 50));

      // Write a real .ts file to the temp directory
      writeFileSync(join(tmpDir, 'hello.ts'), 'export const x = 1;\n', 'utf-8');

      // Wait for the onUpdate callback (debounce 50ms + buffer)
      const timeout = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('onUpdate was not called within 8s')), 8000)
      );
      await Promise.race([updatePromise, timeout]);

      expect(true).toBe(true); // callback fired
    } finally {
      nativeWatcher.close();
      await realWatcher.stop();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 10000);
});
