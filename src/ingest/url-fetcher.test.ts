// Tests for url-fetcher.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';

describe('fetchUrl', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'graphwiki-test-'));
    vi.restoreAllMocks();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('saves PDF to raw/papers/<sha256>.pdf', async () => {
    const pdfBytes = Buffer.from('%PDF-1.4 fake pdf content');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      arrayBuffer: () => Promise.resolve(pdfBytes.buffer),
      headers: { get: () => 'application/pdf' },
      status: 200,
    }));

    const { fetchUrl } = await import('./url-fetcher.js');
    const result = await fetchUrl('https://example.com/paper.pdf', { graphwikiDir: tmpDir });

    expect(result.kind).toBe('pdf');
    expect(result.savedPath).toBeDefined();
    expect(result.savedPath!.includes('papers')).toBe(true);
    expect(result.savedPath!.endsWith('.pdf')).toBe(true);
    expect(existsSync(result.savedPath!)).toBe(true);
  });

  it('saves tweet to raw/articles/<id>.md', async () => {
    const tweetHtml = `<html><head>
      <meta property="og:description" content="Hello from tweet!" />
    </head><body></body></html>`;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      text: () => Promise.resolve(tweetHtml),
      arrayBuffer: () => Promise.resolve(Buffer.alloc(0).buffer),
      headers: { get: () => 'text/html' },
      status: 200,
    }));

    const { fetchUrl } = await import('./url-fetcher.js');
    const result = await fetchUrl('https://x.com/user/status/9999999', { graphwikiDir: tmpDir });

    expect(result.kind).toBe('tweet');
    expect(result.savedPath).toBeDefined();
    expect(result.savedPath!.includes('articles')).toBe(true);
    expect(result.savedPath!.endsWith('.md')).toBe(true);
    // Tweet ID should be in the filename
    expect(result.savedPath!.includes('9999999')).toBe(true);
    expect(existsSync(result.savedPath!)).toBe(true);

    const content = readFileSync(result.savedPath!, 'utf-8');
    expect(content).toContain('tweet_id:');
  });

  it('returns metadata-only for video URL (media-unsupported)', async () => {
    // No fetch call needed — video detected by URL pattern
    const { fetchUrl } = await import('./url-fetcher.js');
    const result = await fetchUrl('https://www.youtube.com/watch?v=abc123', { graphwikiDir: tmpDir });

    expect(result.kind).toBe('media-unsupported');
    expect(result.savedPath).toBeUndefined();
    expect(result.note).toBeDefined();
    expect(result.note).toContain('Phase 6b');
  });

  it('returns metadata-only for audio URL (media-unsupported)', async () => {
    const { fetchUrl } = await import('./url-fetcher.js');
    const result = await fetchUrl('https://example.com/podcast.mp3', { graphwikiDir: tmpDir });

    expect(result.kind).toBe('media-unsupported');
    expect(result.savedPath).toBeUndefined();
    expect(result.note).toBeDefined();
  });

  it('saves HTML to raw/articles/<sha256>.md', async () => {
    const html = '<html><head><title>My Article</title></head><body><p>Hello World</p></body></html>';

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      text: () => Promise.resolve(html),
      headers: { get: () => 'text/html' },
      status: 200,
    }));

    const { fetchUrl } = await import('./url-fetcher.js');
    const result = await fetchUrl('https://example.com/article', { graphwikiDir: tmpDir });

    expect(result.kind).toBe('html');
    expect(result.savedPath).toBeDefined();
    expect(result.savedPath!.endsWith('.md')).toBe(true);
    expect(existsSync(result.savedPath!)).toBe(true);

    const saved = readFileSync(result.savedPath!, 'utf-8');
    expect(saved).toContain('url:');
    expect(saved).toContain('Hello World');
  });
});
