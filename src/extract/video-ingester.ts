// Video ingester for GraphWiki v2
// Extracts audio from video URLs and transcribes via Whisper
// Checks whisper-cache before calling the API; stores results in cache.

import { readFileSync, existsSync } from 'fs';
import { transcribeFromUrl, transcribeAudioFile } from './whisper.js';
import { computeCacheKey, getCachedTranscript, setCachedTranscript } from './whisper-cache.js';

export interface VideoIngestResult {
  url: string;
  title?: string;
  transcript: string;
  language?: string;
  duration?: number;
  tokens_used: number;
}

/**
 * Read god-node terms from GRAPH_REPORT.md to use as Whisper initial_prompt.
 * Returns undefined if the file is not present or unreadable.
 */
function readDomainPrompt(_graphwikiDir = '.graphwiki'): string | undefined {
  const reportPath = 'GRAPH_REPORT.md';
  if (!existsSync(reportPath)) return undefined;

  try {
    const content = readFileSync(reportPath, 'utf-8');
    // Extract god-node terms: lines that look like "- NodeLabel (score)" or "## God Nodes" section
    const lines = content.split('\n');
    const terms: string[] = [];
    let inGodSection = false;

    for (const line of lines) {
      if (/^#+\s*god.?node/i.test(line)) {
        inGodSection = true;
        continue;
      }
      if (inGodSection && /^#+/.test(line)) {
        inGodSection = false;
      }
      if (inGodSection) {
        const match = line.match(/[-*]\s+([^(]+)/);
        if (match?.[1]) {
          terms.push(match[1].trim());
        }
      }
    }

    if (terms.length === 0) return undefined;
    return terms.slice(0, 20).join(', ');
  } catch {
    return undefined;
  }
}

/**
 * Ingest a video URL: check cache, download audio and transcribe if needed.
 */
export async function ingestVideo(
  url: string,
  title?: string,
  graphwikiDir = '.graphwiki',
): Promise<VideoIngestResult> {
  // Check cache using URL as cache key
  const urlKey = computeCacheKey(Buffer.from(url));
  const cached = await getCachedTranscript(urlKey, graphwikiDir);

  if (cached) {
    return {
      url,
      title,
      transcript: cached.text,
      language: cached.language,
      duration: cached.duration,
      tokens_used: cached.tokens_used,
    };
  }

  const domainPrompt = readDomainPrompt(graphwikiDir);
  const transcription = await transcribeFromUrl(url, domainPrompt ? { initialPrompt: domainPrompt } : undefined);

  await setCachedTranscript(urlKey, transcription, graphwikiDir);

  return {
    url,
    title,
    transcript: transcription.text,
    language: transcription.language,
    duration: transcription.duration,
    tokens_used: transcription.tokens_used,
  };
}

/**
 * Ingest a video file: check cache, transcribe directly if needed.
 */
export async function ingestVideoFile(
  filePath: string,
  mimeType = 'video/mp4',
  graphwikiDir = '.graphwiki',
): Promise<VideoIngestResult> {
  // Compute cache key from file content
  let fileBuffer: Buffer;
  try {
    fileBuffer = readFileSync(filePath);
  } catch {
    throw new Error(`Cannot read file: ${filePath}`);
  }

  const hash = computeCacheKey(fileBuffer);
  const cached = await getCachedTranscript(hash, graphwikiDir);

  if (cached) {
    return {
      url: filePath,
      transcript: cached.text,
      language: cached.language,
      duration: cached.duration,
      tokens_used: cached.tokens_used,
    };
  }

  const domainPrompt = readDomainPrompt(graphwikiDir);
  const transcription = await transcribeAudioFile(filePath, {
    mimeType,
    initialPrompt: domainPrompt,
  });

  await setCachedTranscript(hash, transcription, graphwikiDir);

  return {
    url: filePath,
    transcript: transcription.text,
    language: transcription.language,
    duration: transcription.duration,
    tokens_used: transcription.tokens_used,
  };
}
