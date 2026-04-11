// Whisper transcript cache for GraphWiki
// Cache key: SHA-256 of the audio file content
// Storage: .graphwiki/cache/whisper/<hash>.json

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { TranscriptionResult } from './whisper.js';

export interface CachedEntry {
  hash: string;
  cached_at: string;
  result: TranscriptionResult;
}

function cacheDir(graphwikiDir = '.graphwiki'): string {
  return join(graphwikiDir, 'cache', 'whisper');
}

function cachePath(hash: string, graphwikiDir = '.graphwiki'): string {
  return join(cacheDir(graphwikiDir), `${hash}.json`);
}

/**
 * Compute SHA-256 cache key from audio file buffer.
 */
export function computeCacheKey(fileBuffer: Buffer): string {
  return createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Retrieve a cached transcript. Returns undefined on miss.
 */
export async function getCachedTranscript(
  hash: string,
  graphwikiDir = '.graphwiki',
): Promise<TranscriptionResult | undefined> {
  const path = cachePath(hash, graphwikiDir);
  if (!existsSync(path)) return undefined;

  try {
    const raw = await readFile(path, 'utf-8');
    const entry = JSON.parse(raw) as CachedEntry;
    return entry.result;
  } catch {
    return undefined;
  }
}

/**
 * Store a transcript result in the cache.
 */
export async function setCachedTranscript(
  hash: string,
  result: TranscriptionResult,
  graphwikiDir = '.graphwiki',
): Promise<void> {
  const dir = cacheDir(graphwikiDir);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const entry: CachedEntry = {
    hash,
    cached_at: new Date().toISOString(),
    result,
  };

  await writeFile(cachePath(hash, graphwikiDir), JSON.stringify(entry, null, 2), 'utf-8');
}
