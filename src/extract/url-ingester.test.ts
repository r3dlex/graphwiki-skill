// Tests for url-ingester.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('url-ingester', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchUrl', () => {
    it('should fetch URL and extract title', async () => {
      const mockResponse = {
        status: 200,
        text: () => Promise.resolve('<html><head><title>Test Page</title></head><body>Content here</body></html>'),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const { fetchUrl } = await import('./url-ingester.js');
      const result = await fetchUrl('https://example.com/page');

      expect(fetch).toHaveBeenCalledWith('https://example.com/page', expect.any(Object));
      expect(result.title).toBe('Test Page');
      expect(result.status).toBe(200);
    });

    it('should strip HTML tags and clean text', async () => {
      const mockResponse = {
        status: 200,
        text: () => Promise.resolve(
          '<html><head><title>Test</title></head><body><script>alert("hi")</script><style>body{}</style><p>Hello World</p></body></html>'
        ),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const { fetchUrl } = await import('./url-ingester.js');
      const result = await fetchUrl('https://example.com');

      expect(result.text).not.toContain('<script>');
      expect(result.text).not.toContain('<style>');
      expect(result.text).toContain('Hello World');
    });

    it('should handle HTML entities', async () => {
      const mockResponse = {
        status: 200,
        text: () => Promise.resolve('<html><head><title>Test</title></head><body>&amp; &lt; &gt; &quot;</body></html>'),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const { fetchUrl } = await import('./url-ingester.js');
      const result = await fetchUrl('https://example.com');

      expect(result.text).toContain('& < > "');
    });

    it('should include description (first 500 chars)', async () => {
      const longContent = '<html><body>' + 'a'.repeat(1000) + '</body></html>';
      const mockResponse = {
        status: 200,
        text: () => Promise.resolve(longContent),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const { fetchUrl } = await import('./url-ingester.js');
      const result = await fetchUrl('https://example.com');

      expect(result.description.length).toBeLessThanOrEqual(500);
    });

    it('should return full response with url and html', async () => {
      const mockHtml = '<html><head><title>Test</title></head><body>Content</body></html>';
      const mockResponse = {
        status: 200,
        text: () => Promise.resolve(mockHtml),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const { fetchUrl } = await import('./url-ingester.js');
      const result = await fetchUrl('https://example.com/test');

      expect(result.url).toBe('https://example.com/test');
      expect(result.html).toBe(mockHtml);
    });
  });

  describe('ingestUrl', () => {
    it('should return content and metadata for valid URL', async () => {
      const mockResponse = {
        status: 200,
        text: () => Promise.resolve('<html><head><title>My Page</title></head><body>Page content here</body></html>'),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const { ingestUrl } = await import('./url-ingester.js');
      const result = await ingestUrl('https://example.com/page');

      expect(result.content).toBeTruthy();
      expect(result.metadata.source).toBe('url');
      expect(result.metadata.url).toBe('https://example.com/page');
      expect(result.metadata.title).toBe('My Page');
      expect(result.metadata.ingested_at).toBeDefined();
    });

    it('should throw error for non-200 status', async () => {
      const mockResponse = {
        status: 404,
        text: () => Promise.resolve('<html><body>Not Found</body></html>'),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const { ingestUrl } = await import('./url-ingester.js');
      await expect(ingestUrl('https://example.com/notfound')).rejects.toThrow('Failed to fetch URL: HTTP 404');
    });

    it('should include description in metadata', async () => {
      const mockResponse = {
        status: 200,
        text: () => Promise.resolve('<html><body>' + 'x'.repeat(600) + '</body></html>'),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const { ingestUrl } = await import('./url-ingester.js');
      const result = await ingestUrl('https://example.com');

      expect((result.metadata.description as string).length).toBeLessThanOrEqual(500);
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const { fetchUrl } = await import('./url-ingester.js');
      await expect(fetchUrl('https://example.com')).rejects.toThrow('Network error');
    });

    it('should handle 500 server errors via ingestUrl', async () => {
      const mockResponse = {
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const { ingestUrl } = await import('./url-ingester.js');
      await expect(ingestUrl('https://example.com')).rejects.toThrow('Failed to fetch URL: HTTP 500');
    });
  });

  describe('title extraction', () => {
    it('should handle title with special characters', async () => {
      const mockResponse = {
        status: 200,
        text: () => Promise.resolve('<html><head><title>Test Page &amp; More</title></head><body>Content</body></html>'),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const { fetchUrl } = await import('./url-ingester.js');
      const result = await fetchUrl('https://example.com');

      expect(result.title).toBe('Test Page &amp; More');
    });

    it('should handle missing title tag', async () => {
      const mockResponse = {
        status: 200,
        text: () => Promise.resolve('<html><head></head><body>No title here</body></html>'),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const { fetchUrl } = await import('./url-ingester.js');
      const result = await fetchUrl('https://example.com');

      expect(result.title).toBeUndefined();
    });
  });
});
