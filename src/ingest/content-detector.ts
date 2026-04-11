// Content type detection for GraphWiki ingest pipeline
// Dispatch layer: URL pattern matching first, then HTTP HEAD Content-Type

export type ContentKind =
  | 'html'
  | 'pdf'
  | 'tweet'
  | 'video'
  | 'audio'
  | 'media-unsupported';

export interface DetectionResult {
  kind: ContentKind;
  mime?: string;
  confidence: 'high' | 'low';
}

const TWEET_PATTERN = /^https?:\/\/(www\.)?(twitter\.com|x\.com)\//i;
const PDF_PATTERN = /\.pdf(\?.*)?$|\/pdf\//i;
const VIDEO_PATTERN =
  /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/|vimeo\.com\/)/i;
const AUDIO_EXT_PATTERN = /\.(mp3|m4a|ogg|flac|wav|aac|opus)(\?.*)?$/i;

/**
 * Detect content type for a given URL.
 * Uses URL pattern matching first; falls back to HTTP HEAD if uncertain.
 */
export async function detectContent(url: string): Promise<DetectionResult> {
  // 1. Tweet
  if (TWEET_PATTERN.test(url)) {
    return { kind: 'tweet', confidence: 'high' };
  }

  // 2. PDF by extension
  if (PDF_PATTERN.test(url)) {
    return { kind: 'pdf', mime: 'application/pdf', confidence: 'high' };
  }

  // 3. Video (YouTube / Vimeo)
  if (VIDEO_PATTERN.test(url)) {
    return { kind: 'media-unsupported', confidence: 'high' };
  }

  // 4. Audio by extension
  if (AUDIO_EXT_PATTERN.test(url)) {
    return { kind: 'media-unsupported', confidence: 'high' };
  }

  // 5. HTTP HEAD fallback
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const contentType = response.headers.get('content-type') ?? '';
    const mime = contentType.split(';')[0]?.trim();

    if (mime === 'application/pdf') {
      return { kind: 'pdf', mime, confidence: 'low' };
    }
    if (mime?.startsWith('video/')) {
      return { kind: 'media-unsupported', mime, confidence: 'low' };
    }
    if (mime?.startsWith('audio/')) {
      return { kind: 'media-unsupported', mime, confidence: 'low' };
    }
    return { kind: 'html', mime, confidence: 'low' };
  } catch {
    // If HEAD fails, assume HTML
    return { kind: 'html', confidence: 'low' };
  }
}
