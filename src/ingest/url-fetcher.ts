// URL fetcher for GraphWiki ingest pipeline
// Handles HTML, PDF, and tweet fetching; saves raw artifacts to .graphwiki/raw/

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { detectContent } from './content-detector.js';

export interface FetchResult {
  url: string;
  kind: 'html' | 'pdf' | 'tweet' | 'media-unsupported';
  savedPath?: string;
  content?: string;
  title?: string;
  metadata?: Record<string, unknown>;
  note?: string;
}

export interface FetchOptions {
  graphwikiDir?: string;
  author?: string;
  contributor?: string;
}

function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

async function ensureDir(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}

async function fetchHtml(url: string, rawDir: string): Promise<FetchResult> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'GraphWiki/3.0 (knowledge-graph-builder)' },
  });

  const html = await response.text();

  // Readability-style extraction: strip scripts/styles, extract title + body text
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch?.[1]?.trim();

  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

  const hash = sha256Hex(url);
  const articlesDir = join(rawDir, 'articles');
  await ensureDir(articlesDir);

  const frontmatter = [
    '---',
    `url: "${url}"`,
    title ? `title: "${title.replace(/"/g, '\\"')}"` : null,
    `fetched_at: "${new Date().toISOString()}"`,
    '---',
    '',
    text,
  ]
    .filter(l => l !== null)
    .join('\n');

  const savedPath = join(articlesDir, `${hash}.md`);
  await writeFile(savedPath, frontmatter, 'utf-8');

  return { url, kind: 'html', savedPath, content: text, title };
}

async function fetchPdf(url: string, rawDir: string): Promise<FetchResult> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'GraphWiki/3.0 (knowledge-graph-builder)' },
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  const hash = sha256Hex(buffer);

  const papersDir = join(rawDir, 'papers');
  await ensureDir(papersDir);

  const savedPath = join(papersDir, `${hash}.pdf`);
  await writeFile(savedPath, buffer);

  return { url, kind: 'pdf', savedPath };
}

async function fetchTweet(url: string, rawDir: string): Promise<FetchResult> {
  // Extract tweet ID from URL
  const idMatch = url.match(/\/status\/(\d+)/);
  const tweetId = idMatch?.[1] ?? sha256Hex(url).substring(0, 16);

  const articlesDir = join(rawDir, 'articles');
  await ensureDir(articlesDir);

  // Fetch the tweet page and extract OG meta tags for text
  let tweetText = '';
  let authorName = '';
  let publishedAt = '';

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; GraphWiki/3.0; +https://github.com/graphwiki)',
      },
    });
    const html = await response.text();

    const ogDesc = html.match(
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    );
    tweetText = ogDesc?.[1] ?? '';

    const ogSite = html.match(
      /<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i,
    );
    authorName = ogSite?.[1] ?? '';
  } catch {
    tweetText = '';
  }

  const metadata: Record<string, unknown> = {
    url,
    tweet_id: tweetId,
    author: authorName || undefined,
    published_at: publishedAt || undefined,
    fetched_at: new Date().toISOString(),
  };

  const frontmatter = [
    '---',
    `url: "${url}"`,
    `tweet_id: "${tweetId}"`,
    authorName ? `author: "${authorName.replace(/"/g, '\\"')}"` : null,
    `fetched_at: "${new Date().toISOString()}"`,
    '---',
    '',
    tweetText,
  ]
    .filter(l => l !== null)
    .join('\n');

  const savedPath = join(articlesDir, `${tweetId}.md`);
  await writeFile(savedPath, frontmatter, 'utf-8');

  return { url, kind: 'tweet', savedPath, content: tweetText, metadata };
}

/**
 * Fetch a URL and save raw content to .graphwiki/raw/.
 * Routes to the appropriate handler based on content detection.
 */
export async function fetchUrl(
  url: string,
  opts: FetchOptions = {},
): Promise<FetchResult> {
  const graphwikiDir = opts.graphwikiDir ?? '.graphwiki';
  const rawDir = join(graphwikiDir, 'raw');
  await ensureDir(rawDir);

  const detection = await detectContent(url);

  switch (detection.kind) {
    case 'pdf':
      return fetchPdf(url, rawDir);

    case 'tweet':
      return fetchTweet(url, rawDir);

    case 'media-unsupported':
      return {
        url,
        kind: 'media-unsupported',
        note: 'Video/audio transcription is not yet supported in this phase. Run graphwiki add with --transcribe flag when Phase 6b is complete.',
        metadata: { detected_mime: detection.mime },
      };

    default:
      return fetchHtml(url, rawDir);
  }
}
