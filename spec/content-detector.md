# Content Detector

Content detector identifies file types, languages, and binary status to determine extraction eligibility.

## File Type Detection

Detects based on extension and magic bytes:

```typescript
interface FileInfo {
  path: string;
  type: 'code' | 'document' | 'image' | 'video' | 'audio' | 'archive' | 'binary' | 'unknown';
  language?: string;
  isBinary: boolean;
  size: number;
}
```

### Supported Extensions

| Category | Extensions |
|----------|-----------|
| Code | .ts, .js, .py, .go, .rs, .java, .rb, .cpp, .c, .swift, .kt |
| Document | .md, .txt, .pdf, .docx, .html |
| Image | .png, .jpg, .jpeg, .gif, .svg, .webp |
| Video | .mp4, .mkv, .mov, .webm |
| Audio | .mp3, .wav, .m4a, .flac |
| Archive | .zip, .tar, .gz, .7z |

## Language Detection

Heuristics:
- File extension mapping
- Shebang detection (`#!/usr/bin/python`)
- Magic bytes for compiled binaries
- Token analysis for ambiguous files

```typescript
interface LanguageInfo {
  name: string;
  version?: string;
  confidence: 'high' | 'medium' | 'low';
}
```

## Binary Skip Logic

Files are skipped if:
- Magic bytes indicate binary format
- Size exceeds `MAX_FILE_SIZE` (default: 10MB)
- Detected as compiled object (.o, .pyc, .class)

## API

```typescript
class ContentDetector {
  detect(filePath: string): Promise<FileInfo>;
  detectLanguage(content: string): LanguageInfo;
  isBinary(filePath: string): Promise<boolean>;
  shouldProcess(filePath: string): Promise<boolean>;
}
```

## Extraction Eligibility

File is processed if:
- Not binary
- Size < limit
- Type is code or document
- Not in ignore list
