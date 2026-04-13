import { resolve } from 'path';

export function validateUrl(url: string): { valid: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }

  // Block dangerous schemes
  const allowedSchemes = ['http:', 'https:'];
  if (!allowedSchemes.includes(parsed.protocol)) {
    return { valid: false, reason: `Scheme not allowed: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost
  if (hostname === 'localhost') {
    return { valid: false, reason: 'Private/loopback address not allowed' };
  }

  // Block IPv6 loopback
  if (hostname === '[::1]' || hostname === '::1') {
    return { valid: false, reason: 'Private/loopback address not allowed' };
  }

  // Block cloud metadata endpoints
  if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
    return { valid: false, reason: 'Metadata endpoint not allowed' };
  }

  // Parse IPv4 and block private ranges
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    // 127.x.x.x — loopback
    if (a === 127) {
      return { valid: false, reason: 'Private/loopback address not allowed' };
    }
    // 10.x.x.x — private
    if (a === 10) {
      return { valid: false, reason: 'Private address not allowed' };
    }
    // 192.168.x.x — private
    if (a === 192 && b === 168) {
      return { valid: false, reason: 'Private address not allowed' };
    }
    // 172.16.x.x – 172.31.x.x — private
    if (a === 172 && b >= 16 && b <= 31) {
      return { valid: false, reason: 'Private address not allowed' };
    }
    // 169.254.x.x — link-local
    if (a === 169 && b === 254) {
      return { valid: false, reason: 'Link-local address not allowed' };
    }
  }

  return { valid: true };
}

export function sanitizePath(inputPath: string, projectRoot: string): string {
  if (inputPath.includes('../')) {
    throw new Error(`Path traversal detected in: ${inputPath}`);
  }
  const resolved = resolve(projectRoot, inputPath);
  const normalizedRoot = resolve(projectRoot);
  if (!resolved.startsWith(normalizedRoot + '/') && resolved !== normalizedRoot) {
    throw new Error(`Path escapes project root: ${resolved}`);
  }
  return resolved;
}

export function sanitizeLabel(label: string): string {
  // Strip control chars (0x00–0x1F and 0x7F)
  // eslint-disable-next-line no-control-regex
  let result = label.replace(/[\x00-\x1F\x7F]/g, '');
  // Truncate to 256 chars
  result = result.slice(0, 256);
  // HTML-escape
  result = result
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return result;
}

export function escapeCypher(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');
}
