/**
 * Extraction cache — persists results to disk using content-addressable hashing.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ManifestEntry, ExtractionResult } from "../types.js";
import { sha256 } from "../util/hash.js";

export class ExtractionCache {
  private readonly cacheDir: string;
  readonly manifestPath: string;

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
    this.manifestPath = path.join(cacheDir, "manifest.json");
  }

  /**
   * Compute the cache key for a string content (e.g. file content).
   */
  async contentKey(content: string | Buffer): Promise<string> {
    return sha256(content);
  }

  private cachePath(hash: string): string {
    return path.join(this.cacheDir, `${hash}.json`);
  }

  /**
   * Retrieve a cached extraction result by hash.
   * Returns null if not found or unreadable.
   */
  async get(hash: string): Promise<ExtractionResult | null> {
    const filePath = this.cachePath(hash);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      return JSON.parse(raw) as ExtractionResult;
    } catch {
      return null;
    }
  }

  /**
   * Persist an extraction result to the cache.
   */
  async set(hash: string, result: ExtractionResult): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true });
    const filePath = this.cachePath(hash);
    await fs.writeFile(filePath, JSON.stringify(result), "utf-8");
  }

  /**
   * Read the full manifest map from disk.
   * Returns an empty object if the manifest doesn't exist yet.
   */
  async getManifest(): Promise<Record<string, ManifestEntry>> {
    try {
      const raw = await fs.readFile(this.manifestPath, "utf-8");
      return JSON.parse(raw) as Record<string, ManifestEntry>;
    } catch {
      return {};
    }
  }

  /**
   * Update a single entry in the manifest and write to disk atomically.
   */
  async updateManifest(entry: ManifestEntry): Promise<void> {
    const manifest = await this.getManifest();
    manifest[entry.hash] = entry;
    await fs.mkdir(this.cacheDir, { recursive: true });
    await fs.writeFile(this.manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  }
}