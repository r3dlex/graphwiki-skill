// Tests for content-detector.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectContent } from './content-detector.js';

describe('detectContent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('detects tweet from x.com URL', async () => {
    const result = await detectContent('https://x.com/user/status/123456');
    expect(result.kind).toBe('tweet');
    expect(result.confidence).toBe('high');
  });

  it('detects tweet from twitter.com URL', async () => {
    const result = await detectContent('https://twitter.com/user/status/789');
    expect(result.kind).toBe('tweet');
    expect(result.confidence).toBe('high');
  });

  it('detects pdf from .pdf extension', async () => {
    const result = await detectContent('https://example.com/paper.pdf');
    expect(result.kind).toBe('pdf');
    expect(result.mime).toBe('application/pdf');
    expect(result.confidence).toBe('high');
  });

  it('detects pdf with query string', async () => {
    const result = await detectContent('https://arxiv.org/pdf/1234.5678?download=true');
    expect(result.kind).toBe('pdf');
    expect(result.confidence).toBe('high');
  });

  it('detects youtube as media-unsupported', async () => {
    const result = await detectContent('https://www.youtube.com/watch?v=abc123');
    expect(result.kind).toBe('media-unsupported');
    expect(result.confidence).toBe('high');
  });

  it('detects youtu.be short URL as media-unsupported', async () => {
    const result = await detectContent('https://youtu.be/abc123');
    expect(result.kind).toBe('media-unsupported');
    expect(result.confidence).toBe('high');
  });

  it('detects vimeo as media-unsupported', async () => {
    const result = await detectContent('https://vimeo.com/123456789');
    expect(result.kind).toBe('media-unsupported');
    expect(result.confidence).toBe('high');
  });

  it('detects mp3 audio extension as media-unsupported', async () => {
    const result = await detectContent('https://example.com/podcast.mp3');
    expect(result.kind).toBe('media-unsupported');
    expect(result.confidence).toBe('high');
  });

  it('falls back to HEAD request for unknown URL and returns html', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      headers: { get: () => 'text/html; charset=utf-8' },
    }));
    const result = await detectContent('https://example.com/page');
    expect(result.kind).toBe('html');
    expect(result.confidence).toBe('low');
  });

  it('falls back to HEAD request and detects pdf by content-type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      headers: { get: () => 'application/pdf' },
    }));
    const result = await detectContent('https://example.com/doc');
    expect(result.kind).toBe('pdf');
    expect(result.mime).toBe('application/pdf');
  });

  it('returns html when HEAD request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const result = await detectContent('https://example.com/page');
    expect(result.kind).toBe('html');
    expect(result.confidence).toBe('low');
  });
});
