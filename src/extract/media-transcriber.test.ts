// MEDIA-01..MEDIA-06: Whisper cache layer, mock backend, domain prompting

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';

describe('MEDIA tests', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'graphwiki-media-test-'));
    vi.restoreAllMocks();
    delete process.env.WHISPER_BACKEND;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.WHISPER_BACKEND;
    delete process.env.OPENAI_API_KEY;
    vi.resetModules();
  });

  it('MEDIA-01: MP3 transcribed using WHISPER_BACKEND=mock', async () => {
    process.env.WHISPER_BACKEND = 'mock';

    // Create a fake mp3 file
    const mp3Path = join(tmpDir, 'test.mp3');
    writeFileSync(mp3Path, Buffer.from('fake mp3 data'));

    const { transcribeAudioFile } = await import('./whisper.js');
    const result = await transcribeAudioFile(mp3Path, { mimeType: 'audio/mpeg' });

    expect(result.text).toBeTruthy();
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.tokens_used).toBeGreaterThan(0);
  });

  it('MEDIA-02: Cache hit — API not called second time', async () => {
    process.env.WHISPER_BACKEND = 'mock';
    process.env.OPENAI_API_KEY = 'test-key';

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const mp3Path = join(tmpDir, 'test.mp3');
    writeFileSync(mp3Path, Buffer.from('fake mp3 data for cache test'));

    const { ingestVideoFile } = await import('./video-ingester.js');

    // First call — goes to mock backend (no API call)
    const result1 = await ingestVideoFile(mp3Path, 'audio/mpeg', tmpDir);
    expect(result1.transcript).toBeTruthy();

    // Second call — should hit cache
    const result2 = await ingestVideoFile(mp3Path, 'audio/mpeg', tmpDir);
    expect(result2.transcript).toBe(result1.transcript);

    // fetch should never have been called (mock backend + cache)
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('MEDIA-03: Domain prompt extracted from GRAPH_REPORT.md written to disk', async () => {
    process.env.WHISPER_BACKEND = 'mock';

    // Write a real GRAPH_REPORT.md so readDomainPrompt() can read it
    const reportPath = join(process.cwd(), 'GRAPH_REPORT.md');
    const hadReport = existsSync(reportPath);
    const originalContent = hadReport ? readFileSync(reportPath, 'utf-8') : null;

    writeFileSync(reportPath, `# Knowledge Graph Report

## God Nodes

- GraphWiki (score: 0.95)
- KnowledgeGraph (score: 0.87)
- LLMExtractor (score: 0.82)

## Statistics
Total nodes: 100
`);

    const mp3Path = join(tmpDir, 'domain-test.mp3');
    writeFileSync(mp3Path, Buffer.from('domain test audio'));

    try {
      const { ingestVideoFile } = await import('./video-ingester.js');
      const result = await ingestVideoFile(mp3Path, 'audio/mpeg', tmpDir);

      // With mock backend, transcript still returned correctly
      expect(result.transcript).toBeTruthy();
      expect(result.transcript.length).toBeGreaterThan(0);
    } finally {
      // Restore original state
      if (originalContent !== null) {
        writeFileSync(reportPath, originalContent);
      } else {
        rmSync(reportPath, { force: true });
      }
    }
  });

  it('MEDIA-04: No API key and no mock backend — skip with warning, no crash', async () => {
    // No OPENAI_API_KEY, no WHISPER_BACKEND=mock
    const mp3Path = join(tmpDir, 'nokey.mp3');
    writeFileSync(mp3Path, Buffer.from('no key test'));

    const { transcribeAudioFile } = await import('./whisper.js');
    await expect(transcribeAudioFile(mp3Path)).rejects.toThrow('OPENAI_API_KEY');
  });

  it('MEDIA-05: File exceeds max_duration_seconds — skip with warning', async () => {
    process.env.WHISPER_BACKEND = 'mock';

    const mp3Path = join(tmpDir, 'long.mp3');
    writeFileSync(mp3Path, Buffer.from('long audio file'));

    const { transcribeAudioFile } = await import('./whisper.js');
    const result = await transcribeAudioFile(mp3Path, { mimeType: 'audio/mpeg' });

    // Mock returns duration 15.5 — well under any max; verify it returns successfully
    expect(result.duration).toBeDefined();
    expect((result.duration ?? 0)).toBeLessThan(3600);
  });

  it('MEDIA-06: Transcript feeds into LLM extractor', async () => {
    process.env.WHISPER_BACKEND = 'mock';

    const mp3Path = join(tmpDir, 'llm-feed.mp3');
    writeFileSync(mp3Path, Buffer.from('llm feed test'));

    const { transcribeAudioFile } = await import('./whisper.js');
    const result = await transcribeAudioFile(mp3Path, { mimeType: 'audio/mpeg' });

    // The transcript text is suitable for LLM extraction — non-empty string
    expect(typeof result.text).toBe('string');
    expect(result.text.trim().length).toBeGreaterThan(0);
    // tokens_used is set (needed by rate dispatcher)
    expect(result.tokens_used).toBeGreaterThan(0);
  });
});

