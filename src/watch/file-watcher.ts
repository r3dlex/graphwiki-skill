// File watcher for GraphWiki v2
// Uses chokidar to watch source files and trigger incremental rebuilds

import chokidar, { type FSWatcher } from 'chokidar';
import type { GraphDocument } from '../types.js';
import { glob } from 'glob';
import { resolveIgnores } from '../util/ignore-resolver.js';
import { classifyFile } from './classify-file.js';

export interface WatchOptions {
  path: string;
  graphPath?: string;
  onUpdate?: (delta: {
    added: string[];
    removed: string[];
    modified: string[];
  }) => void;
  /** Called when doc/media files change and --auto-docs is NOT set. */
  onNotify?: (files: string[]) => void;
  /** When true, doc files are routed to onUpdate instead of onNotify. */
  autoDocs?: boolean;
  onError?: (err: Error) => void;
  debounceMs?: number;
}

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private options: WatchOptions;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingFiles: Map<string, 'add' | 'change' | 'unlink'> = new Map();
  private oldGraph: GraphDocument | null = null;

  constructor(options: WatchOptions) {
    this.options = {
      graphPath: '.graphwiki/graph.json',
      debounceMs: 500,
      ...options,
    };
  }

  async start(): Promise<void> {
    const { path } = this.options;
    const [ignorePatterns] = await resolveIgnores(path);

    // Load existing graph for delta comparison
    try {
      const { readFile } = await import('fs/promises');
      const content = await readFile(this.options.graphPath!, 'utf-8');
      this.oldGraph = JSON.parse(content) as GraphDocument;
    } catch {
      this.oldGraph = null;
    }

    // Discover initial files
    const discovered = await glob('**/*', {
      cwd: path,
      ignore: ignorePatterns,
      absolute: false,
    });

    this.watcher = chokidar.watch('**/*', {
      cwd: path,
      ignored: ignorePatterns,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on('add', (file: string) => this.onEvent('add', file));
    this.watcher.on('change', (file: string) => this.onEvent('change', file));
    this.watcher.on('unlink', (file: string) => this.onEvent('unlink', file));
    this.watcher.on('error', (err: unknown) => { if (err instanceof Error) this.options.onError?.(err); });

    console.log(`[GraphWiki] Watching ${path} for changes...`);
    console.log(`[GraphWiki] Tracking ${discovered.length} initial files`);
  }

  private onEvent(_event: 'add' | 'change' | 'unlink', file: string): void {
    this.pendingFiles.set(file, _event);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.flush(), this.options.debounceMs!);
  }

  private flush(): void {
    if (this.pendingFiles.size === 0) return;

    const files = [...this.pendingFiles.entries()];
    const added: string[] = [];
    const modified: string[] = [];
    const removed: string[] = [];
    const notifyFiles: string[] = [];

    for (const [file, event] of files) {
      if (event === 'unlink') {
        removed.push(file);
        continue;
      }

      const kind = classifyFile(file);

      if (kind === 'media' || (kind === 'doc' && !this.options.autoDocs)) {
        notifyFiles.push(file);
        continue;
      }

      // code, or doc with autoDocs → route to onUpdate
      if (this.oldGraph?.nodes.some((n) => n.source_file === file)) {
        modified.push(file);
      } else {
        added.push(file);
      }
    }

    this.pendingFiles.clear();

    console.log(`[GraphWiki] Detected ${files.length} file changes`);

    if (notifyFiles.length > 0) {
      this.options.onNotify?.(notifyFiles);
    }
    if (added.length > 0 || modified.length > 0 || removed.length > 0) {
      this.options.onUpdate?.({ added, removed, modified });
    }
  }

  async stop(): Promise<void> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    console.log('[GraphWiki] Watch stopped');
  }
}
