// Refinement history for GraphWiki v2
// Append-only log of refinement history with rollback support

import type { RefinementHistoryEntry } from '../types.js';
import { writeFile, readFile, mkdir, rename, unlink } from 'fs/promises';
import { join } from 'path';

const LOCK_FILE_SUFFIX = '.lock';

/**
 * Refinement history manager
 *
 * - Append-only, never truncated
 * - Lock file for concurrent access prevention
 * - Rollback support
 */
export class RefinementHistory {
  private historyPath: string;
  private lockPath: string;

  constructor(historyPath: string) {
    this.historyPath = historyPath;
    this.lockPath = historyPath + LOCK_FILE_SUFFIX;
  }

  /**
   * Append entry to history (thread-safe)
   */
  async append(entry: RefinementHistoryEntry): Promise<void> {
    await this.acquireLock();
    try {
      const history = await this.getHistory();
      history.push(entry);
      await this.writeHistory(history);
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Get full history
   */
  async getHistory(): Promise<RefinementHistoryEntry[]> {
    try {
      const content = await readFile(this.historyPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      return lines.map(line => JSON.parse(line));
    } catch {
      return [];
    }
  }

  /**
   * Rollback to a specific version
   */
  async rollback(targetVersion: string): Promise<void> {
    await this.acquireLock();
    try {
      const history = await this.getHistory();
      const targetIndex = history.findIndex(e => e.version === targetVersion);

      if (targetIndex === -1) {
        throw new Error(`Version ${targetVersion} not found in history`);
      }

      // Mark current version as rollback
      const currentEntry = history[history.length - 1];
      if (currentEntry) {
        currentEntry.rollbackOf = targetVersion;
      }

      // Truncate history to target version
      const truncatedHistory = history.slice(0, targetIndex + 1);

      // Save backup
      const backupPath = this.historyPath + '.backup';
      await rename(this.historyPath, backupPath);

      try {
        await this.writeHistory(truncatedHistory);
      } catch (err) {
        // Restore from backup on failure
        await rename(backupPath, this.historyPath);
        throw err;
      }

      // Remove backup on success
      try {
        await unlink(backupPath);
      } catch {}
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Get latest version
   */
  async getLatestVersion(): Promise<string | null> {
    const history = await this.getHistory();
    if (history.length === 0) return null;
    return history[history.length - 1].version;
  }

  /**
   * Get version by version string
   */
  async getVersion(version: string): Promise<RefinementHistoryEntry | null> {
    const history = await this.getHistory();
    return history.find(e => e.version === version) ?? null;
  }

  /**
   * Get history for a version range
   */
  async getVersionRange(
    fromVersion: string,
    toVersion: string
  ): Promise<RefinementHistoryEntry[]> {
    const history = await this.getHistory();
    const fromIndex = history.findIndex(e => e.version === fromVersion);
    const toIndex = history.findIndex(e => e.version === toVersion);

    if (fromIndex === -1 || toIndex === -1) {
      return [];
    }

    return history.slice(fromIndex, toIndex + 1);
  }

  /**
   * Acquire lock for concurrent access prevention
   */
  private async acquireLock(): Promise<void> {
    const { writeFile, access } = await import('fs/promises');

    // Ensure directory exists
    const dir = this.historyPath.substring(0, this.historyPath.lastIndexOf('/'));
    if (dir) {
      await mkdir(dir, { recursive: true });
    }

    // Try to acquire lock with retry
    const maxRetries = 100;
    for (let i = 0; i < maxRetries; i++) {
      try {
        await access(this.lockPath);
        // Lock exists, wait
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch {
        // Lock doesn't exist, create it
        const lockContent = JSON.stringify({
          pid: process.pid,
          timestamp: new Date().toISOString(),
        });
        await writeFile(this.lockPath, lockContent, { flag: 'wx' });
        return;
      }
    }

    throw new Error('Failed to acquire lock: timeout');
  }

  /**
   * Release lock
   */
  private async releaseLock(): Promise<void> {
    try {
      await unlink(this.lockPath);
    } catch {
      // Ignore if already released
    }
  }

  /**
   * Write history to file
   */
  private async writeHistory(history: RefinementHistoryEntry[]): Promise<void> {
    const { writeFile, mkdir } = await import('fs/promises');

    // Ensure directory exists
    const dir = this.historyPath.substring(0, this.historyPath.lastIndexOf('/'));
    if (dir) {
      await mkdir(dir, { recursive: true });
    }

    // Write as newline-delimited JSON (append-only format)
    const lines = history.map(e => JSON.stringify(e)).join('\n');
    await writeFile(this.historyPath, lines, 'utf-8');
  }
}

/**
 * Create history instance
 */
export function createRefinementHistory(historyPath = '.graphwiki/refinement/history.jsonl'): RefinementHistory {
  return new RefinementHistory(historyPath);
}
