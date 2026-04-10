import { createHash } from "node:crypto";

/**
 * Compute SHA-256 hash of content.
 * Returns lowercase hex string.
 */
export async function sha256(content: string | Buffer): Promise<string> {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Compute xxHash64 via WASM (xxhash-wasm).
 * Returns lowercase hex string.
 */
export async function xxhash(content: string | Buffer): Promise<string> {
  const xxh = await import("xxhash-wasm");
  const hasher = await xxh.default();
  const data = typeof content === "string" ? content : content.toString("binary");
  return hasher.h64ToString(data);
}

/**
 * Compute content hash using xxhash3 (equivalent algorithm).
 * Uses xxhash-wasm h64 for speed.
 * Returns lowercase hex string.
 */
export async function contentHash(content: string | Buffer): Promise<string> {
  return xxhash(content);
}