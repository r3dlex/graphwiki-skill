# Whisper Transcription

Whisper transcription integrates OpenAI Whisper CLI for video/audio transcription during ingestion.

## Usage

```bash
graphwiki add video.mp4 --transcribe
graphwiki add https://youtube.com/watch?v=abc --transcribe
```

## Integration

Via CLI subprocess:

```bash
whisper video.mp4 \
  --model base \
  --output_format json \
  --output_dir ./raw
```

Supported models:
- `tiny` (39M): Fast, lower quality
- `base` (74M): Default, balanced
- `small` (244M): Better quality
- `medium` (769M): High quality

Whisper outputs JSON segments. Each segment becomes a node; LLM infers relations. Transcripts stored in `raw/`. Graceful fallback on errors. Models: `tiny` (fast), `base` (default), `small` (quality), `medium` (best).
