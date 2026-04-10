/**
 * Batch coordinator — tracks file assignment, completion, failure, and skip state
 * across subagents processing a batch of files.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { BatchState, FailedFile, SkippedFile } from "../types.js";

const STATE_FILE = "batch-state.json";

interface PersistedState {
  started_at: number;
  completed_at?: number;
  total_files: number;
  assigned_files: Array<[number, string[]]>;
  completed: string[];
  failed: FailedFile[];
  skipped: SkippedFile[];
}

export class BatchCoordinator {
  private state: BatchState;

  constructor() {
    this.state = {
      started_at: Date.now(),
      total_files: 0,
      assigned_files: new Map(),
      completed: [],
      failed: [],
      skipped: [],
    };
  }

  /**
   * Assign a list of files to a subagent.
   */
  assignFiles(files: string[], subagentId: number): void {
    const current = this.state.assigned_files.get(subagentId) ?? [];
    this.state.assigned_files.set(subagentId, [...current, ...files]);
    this.state.total_files += files.length;
  }

  /**
   * Mark a file as successfully completed.
   */
  markComplete(file: string): void {
    if (!this.state.completed.includes(file)) {
      this.state.completed.push(file);
    }
  }

  /**
   * Mark a file as failed with reason and error message.
   */
  markFailed(file: string, reason: FailedFile["reason"], error: string): void {
    // Avoid duplicate failures
    if (this.state.failed.some(f => f.file === file)) return;
    this.state.failed.push({ file, reason, error, timestamp: Date.now() });
  }

  /**
   * Mark a file as skipped with reason.
   */
  markSkipped(file: string, reason: SkippedFile["reason"]): void {
    if (this.state.skipped.some(s => s.file === file)) return;
    this.state.skipped.push({ file, reason, timestamp: Date.now() });
  }

  /**
   * Finalize the batch (mark completed_at timestamp).
   */
  finalize(): BatchState {
    this.state.completed_at = Date.now();
    return this.state;
  }

  /**
   * Get current batch state.
   */
  getState(): BatchState {
    return this.state;
  }

  /**
   * Persist batch state to disk as JSON.
   */
  async writeState(dir: string): Promise<void> {
    const persisted: PersistedState = {
      started_at: this.state.started_at,
      completed_at: this.state.completed_at,
      total_files: this.state.total_files,
      assigned_files: Array.from(this.state.assigned_files.entries()),
      completed: this.state.completed,
      failed: this.state.failed,
      skipped: this.state.skipped,
    };
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, STATE_FILE), JSON.stringify(persisted, null, 2), "utf-8");
  }

  /**
   * Load batch state from disk. Returns null if not found.
   */
  static async readState(dir: string): Promise<BatchState | null> {
    const filePath = path.join(dir, STATE_FILE);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const persisted = JSON.parse(raw) as PersistedState;
      const state: BatchState = {
        started_at: persisted.started_at,
        completed_at: persisted.completed_at,
        total_files: persisted.total_files,
        assigned_files: new Map(persisted.assigned_files),
        completed: persisted.completed,
        failed: persisted.failed,
        skipped: persisted.skipped,
      };
      return state;
    } catch {
      return null;
    }
  }
}