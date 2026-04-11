import { describe, it, expect, afterEach } from "vitest";
import { ExtractionCache } from "./extraction-cache.js";
import * as fs from "node:fs/promises";
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

  it("returns null when cached file is unreadable", async () => {
    const cache = new ExtractionCache(tmpDir);
    const result = {
      document: { id: "doc1", nodes: [], edges: [] },
      cache_hit: false,
      duration_ms: 100,
    };
    await cache.set("corrupt", result);

    // Corrupt the file to trigger catch block
    const corruptPath = `${tmpDir}/corrupt.json`;
    await fs.writeFile(corruptPath, "not valid json{{", "utf-8");

    const retrieved = await cache.get("corrupt");
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

  it("getManifest returns empty object when manifest is corrupted", async () => {
    const cache = new ExtractionCache(tmpDir);
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(`${tmpDir}/manifest.json`, "not valid json{{", "utf-8");

    const manifest = await cache.getManifest();
    expect(manifest).toEqual({});
  });

  it("set creates cache directory recursively", async () => {
    const nestedCache = new ExtractionCache(`${tmpDir}/nested/deep`);
    await nestedCache.set("hash1", { document: { id: "d", nodes: [], edges: [] }, cache_hit: false, duration_ms: 1 });
    const retrieved = await nestedCache.get("hash1");
    expect(retrieved).not.toBeNull();
  });

  it("contentKey returns a sha256 hash", async () => {
    const cache = new ExtractionCache(tmpDir);
    const key1 = await cache.contentKey("hello world");
    const key2 = await cache.contentKey("hello world");
    const key3 = await cache.contentKey("different");

    expect(key1).toBe(key2); // Same content = same hash
    expect(key3).not.toBe(key1); // Different content = different hash
    expect(key1.length).toBe(64); // SHA-256 hex is 64 chars
  });

  it("contentKey works with Buffer input", async () => {
    const cache = new ExtractionCache(tmpDir);
    const key = await cache.contentKey(Buffer.from("test content"));
    expect(key.length).toBe(64);
  });

  it("updateManifest overwrites existing entry with same hash", async () => {
    const cache = new ExtractionCache(tmpDir);
    const entry1 = {
      file: "src/test.ts",
      hash: "hash456",
      extractor: "ast",
      timestamp: Date.now(),
      size_bytes: 1024,
      node_count: 5,
      edge_count: 3,
    };
    const entry2 = {
      file: "src/test.ts",
      hash: "hash456",
      extractor: "ast",
      timestamp: Date.now() + 1000,
      size_bytes: 2048,
      node_count: 10,
      edge_count: 6,
    };

    await cache.updateManifest(entry1);
    await cache.updateManifest(entry2);

    const manifest = await cache.getManifest();
    expect(manifest["hash456"]!.node_count).toBe(10);
    expect(manifest["hash456"]!.size_bytes).toBe(2048);
  });
});