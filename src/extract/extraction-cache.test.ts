import { describe, it, expect } from "vitest";
import { ExtractionCache } from "./extraction-cache.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

describe("ExtractionCache", () => {
  const tmpDir = `/tmp/graphwiki-cache-test-${randomUUID()}`;

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it("stores and retrieves a result by hash", async () => {
    const cache = new ExtractionCache(tmpDir);
    const result = {
      document: {
        id: "doc1",
        nodes: [{ id: "n1", label: "Node1", type: "function", confidence_level: "EXTRACTED" as const }],
        edges: [],
      },
      cache_hit: false,
      duration_ms: 100,
    };

    await cache.set("abc123", result);
    const retrieved = await cache.get("abc123");
    expect(retrieved).toMatchObject(result);
  });

  it("returns null for missing hash", async () => {
    const cache = new ExtractionCache(tmpDir);
    const retrieved = await cache.get("nonexistent");
    expect(retrieved).toBeNull();
  });

  it("updates and retrieves manifest entries", async () => {
    const cache = new ExtractionCache(tmpDir);
    const entry = {
      file: "src/test.ts",
      hash: "hash123",
      extractor: "ast",
      timestamp: Date.now(),
      size_bytes: 1024,
      node_count: 5,
      edge_count: 3,
    };

    await cache.updateManifest(entry);
    const manifest = await cache.getManifest();
    expect(manifest["hash123"]).toMatchObject({ file: "src/test.ts", node_count: 5 });
  });

  it("manifestPath returns path inside cacheDir", () => {
    const cache = new ExtractionCache("/some/path");
    expect(cache.manifestPath).toBe("/some/path/manifest.json");
  });

  it("persists across cache instances", async () => {
    const cache1 = new ExtractionCache(tmpDir);
    const result = {
      document: { id: "doc2", nodes: [], edges: [] },
      cache_hit: true,
      duration_ms: 50,
    };
    await cache1.set("key999", result);

    // Open a new cache instance on same directory
    const cache2 = new ExtractionCache(tmpDir);
    const retrieved = await cache2.get("key999");
    expect(retrieved).toMatchObject(result);
  });

  it("getManifest returns empty object when no manifest exists", async () => {
    const cache = new ExtractionCache(tmpDir);
    const manifest = await cache.getManifest();
    expect(manifest).toEqual({});
  });

  it("set creates cache directory recursively", async () => {
    const nestedCache = new ExtractionCache(`${tmpDir}/nested/deep`);
    await nestedCache.set("hash1", { document: { id: "d", nodes: [], edges: [] }, cache_hit: false, duration_ms: 1 });
    const retrieved = await nestedCache.get("hash1");
    expect(retrieved).not.toBeNull();
  });
});