# URL Fetcher

URL fetcher ingests content from HTTP(S) URLs with automatic type detection.

## Usage

```bash
graphwiki add https://example.com/article
graphwiki add https://example.com/doc.pdf
graphwiki add "https://twitter.com/user/status/123"
graphwiki add https://example.com/video.mp4 --transcribe
```

## Type Detection

Automatic detection via:
- HTTP Content-Type header
- URL extension
- Downloaded content magic bytes

```typescript
interface URLType {
  type: 'html' | 'pdf' | 'tweet' | 'video' | 'image' | 'unknown';
  mimeType?: string;
  metadata?: Record<string, unknown>;
}
```

## Storage

Downloaded content stored in `raw/` directory:

```
raw/
  2026-04-12_example-com_article.html
  2026-04-12_example-com_doc.pdf
  2026-04-12_twitter_status_123.json
  2026-04-12_video_transcript.txt
```

Naming: `YYYY-MM-DD_domain_identifier.ext`

Type handlers: HTML (text extraction), PDF (per-page), Tweet (JSON/scrape), Video (transcript via Whisper). Rate limiting respects HTTP headers with exponential backoff. Security: HTTP(S) only, 10s timeout, 100MB limit.
