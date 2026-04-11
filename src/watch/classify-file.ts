/**
 * Classify a file path into 'code', 'doc', or 'media' based on its extension.
 */

export type FileClass = 'code' | 'doc' | 'media';

const CODE_EXTS = new Set([
  '.ts', '.js', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.cs',
  '.rb', '.php', '.swift', '.lua', '.ex', '.sh', '.zig',
]);

const DOC_EXTS = new Set([
  '.md', '.pdf', '.txt', '.rst', '.adoc',
]);

const MEDIA_EXTS = new Set([
  '.mp4', '.mov', '.avi', '.mkv', '.webm',
  '.mp3', '.wav', '.m4a', '.ogg', '.flac',
]);

export function classifyFile(filePath: string): FileClass {
  const dot = filePath.lastIndexOf('.');
  if (dot === -1) return 'code';
  const ext = filePath.slice(dot).toLowerCase();
  if (CODE_EXTS.has(ext)) return 'code';
  if (DOC_EXTS.has(ext)) return 'doc';
  if (MEDIA_EXTS.has(ext)) return 'media';
  return 'code'; // default: treat as code
}
