import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { QueryResult } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CacheEntry {
  result: QueryResult;
  timestamp: number;
  ttl_hours: number;
  traversed_nodes: string[];
}

interface CacheData {
  entries: Record<string, CacheEntry>;
}

export class QueryCache {
  private cachePath: string;
  private ttlHours: number;
  private data: CacheData;

  constructor(cacheDir: string, ttlHours: number = 168) {
    this.ttlHours = ttlHours;
    this.cachePath = join(cacheDir, 'query-cache.json');
    this.data = { entries: {} };
    this.load();
  }

  async get(question: string): Promise<QueryResult | null> {
    const key = this.hashQuestion(question);
    const entry = this.data.entries[key];

    if (!entry) return null;

    const ageHours = (Date.now() - entry.timestamp) / (1000 * 60 * 60);
    if (ageHours > entry.ttl_hours) {
      delete this.data.entries[key];
      this.save();
      return null;
    }

    return entry.result;
  }

  async set(question: string, result: QueryResult): Promise<void> {
    const key = this.hashQuestion(question);

    this.data.entries[key] = {
      result,
      timestamp: Date.now(),
      ttl_hours: this.ttlHours,
      traversed_nodes: result.nodes_traversed ?? [],
    };

    this.save();
  }

  async invalidate(nodeIds: string[]): Promise<void> {
    const nodeIdSet = new Set(nodeIds);
    const keysToDelete: string[] = [];

    for (const [key, entry] of Object.entries(this.data.entries)) {
      const hasTraversedNode = entry.traversed_nodes.some((n) => nodeIdSet.has(n));
      if (hasTraversedNode) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      delete this.data.entries[key];
    }

    if (keysToDelete.length > 0) {
      this.save();
    }
  }

  async clear(): Promise<void> {
    this.data = { entries: {} };
    this.save();
  }

  private load(): void {
    if (existsSync(this.cachePath)) {
      try {
        const raw = readFileSync(this.cachePath, 'utf-8');
        this.data = JSON.parse(raw);
      } catch {
        this.data = { entries: {} };
      }
    }
  }

  private save(): void {
    const dir = join(this.cachePath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.cachePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  private hashQuestion(question: string): string {
    // Simple hash for cache key
    let hash = 0;
    const q = question.toLowerCase().trim();
    for (let i = 0; i < q.length; i++) {
      const char = q.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `q_${Math.abs(hash).toString(36)}`;
  }
}
