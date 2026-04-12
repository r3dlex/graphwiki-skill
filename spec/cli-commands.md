# CLI Commands

GraphWiki exposes all operations via Commander-based CLI with consistent flag naming.

## Command Overview

```
graphwiki <command> [options]
```

### build — Extract and Compile Graph

```bash
graphwiki build [paths...] [options]
  --update              Incremental update instead of full rebuild
  --resume              Resume from last checkpoint
  --permissive          Continue on extraction errors
  --mode standard|deep  Extraction mode (default: standard)
  --directed            Build directed graph
  --watch               Watch files for changes (implies incremental)
  --no-cache            Ignore cached extractions
```

### query — Search Graph

```bash
graphwiki query <term> [options]
  --depth N             Traversal depth (default: 2)
  --limit N             Max results (default: 50)
  --format json|text    Output format
```

### explain — Describe Nodes and Relations

```bash
graphwiki explain <node-id> [options]
  --depth N             Traversal depth
  --include-inferred    Include INFERRED confidence nodes
```

### add — Ingest New Content

```bash
graphwiki add <path|url> [options]
  --type auto|pdf|html|tweet|video   Explicit type detection
  --transcribe          Transcribe video with Whisper
  --url                 Add from HTTP/HTTPS URL
```

### path — Find Shortest Path

```bash
graphwiki path <start> <end>
  --direction forward|backward|both
  --max-hops N          Maximum hops (default: unlimited)
```

### hook — Manage IDE Hooks

```bash
graphwiki hook install [platform]
  --platform claude|auggie|codex   IDE platform
  
graphwiki hook uninstall
graphwiki hook status
```

### skill — Manage Skills

```bash
graphwiki skill install [options]
graphwiki skill uninstall
graphwiki skill list
```

### rollback, serve, benchmark — See respective specs

## Global Flags

All commands accept: `--version`, `--verbose`, `--config <path>`, `--cwd <path>`, `--help`
