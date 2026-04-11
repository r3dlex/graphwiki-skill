// Cache round-trip tests for whisper-cache.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { getCachedTranscript, setCachedTranscript, computeCacheKey } from './whisper-cache.js';
import type { TranscriptionResult } from './whisper.js';

describe('whisper-cache', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'graphwiki-whisper-cache-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trip: setCachedTranscript then getCachedTranscript returns same result', async () => {
    const hash = computeCacheKey(Buffer.from('test-audio-content'));
    const transcript: TranscriptionResult = {
      text: 'Hello from the cache test.',
      language: 'en',
      duration: 5.2,
      tokens_used: 10,
    };

    await setCachedTranscript(hash, transcript, tmpDir);
    const retrieved = await getCachedTranscript(hash, tmpDir);

    expect(retrieved).not.toBeUndefined();
    expect(retrieved!.text).toBe(transcript.text);
    expect(retrieved!.language).toBe(transcript.language);
    expect(retrieved!.duration).toBe(transcript.duration);
    expect(retrieved!.tokens_used).toBe(transcript.tokens_used);
  });

  it('cache miss returns undefined for unknown hash', async () => {
    const hash = computeCacheKey(Buffer.from('nonexistent-audio'));
    const result = await getCachedTranscript(hash, tmpDir);
    expect(result).toBeUndefined();
  });
});
