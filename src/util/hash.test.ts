import { describe, it, expect } from "vitest";
import { sha256, xxhash, contentHash } from "./hash.js";

describe("sha256", () => {
  it("produces a 64-char hex string", async () => {
    const hash = await sha256("hello world");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it("is deterministic", async () => {
    const h1 = await sha256("test content");
    const h2 = await sha256("test content");
    expect(h1).toBe(h2);
  });

  it("handles Buffer input", async () => {
    const hash = await sha256(Buffer.from("test"));
    expect(hash).toHaveLength(64);
  });

  it("produces correct SHA-256 for known input", async () => {
    // SHA-256 of "hello world" (lowercase hex)
    const hash = await sha256("hello world");
    expect(hash).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
  });
});

describe("xxhash", () => {
  it("produces a hex string", async () => {
    const hash = await xxhash("hello world");
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it("is deterministic", async () => {
    const h1 = await xxhash("test content");
    const h2 = await xxhash("test content");
    expect(h1).toBe(h2);
  });

  it("handles Buffer input", async () => {
    const hash = await xxhash(Buffer.from("test"));
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it("differs from SHA-256 (different algorithm)", async () => {
    const xh = await xxhash("hello world");
    const sh = await sha256("hello world");
    expect(xh).not.toBe(sh);
  });
});

describe("contentHash", () => {
  it("uses xxhash internally and returns hex", async () => {
    const hash = await contentHash("hello world");
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it("is deterministic", async () => {
    const h1 = await contentHash("content");
    const h2 = await contentHash("content");
    expect(h1).toBe(h2);
  });

  it("matches xxhash for same input", async () => {
    const content = "test data";
    const [xh, ch] = await Promise.all([xxhash(content), contentHash(content)]);
    expect(ch).toBe(xh);
  });

  it("handles empty string", async () => {
    const hash = await contentHash("");
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it("handles large input", async () => {
    const large = "x".repeat(1_000_000);
    const hash = await contentHash(large);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });
});