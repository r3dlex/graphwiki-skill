# Config Schema

`.graphwiki/config.json` defines extraction settings, output format, and plugin configuration.

## Full Config Structure

```json
{
  "paths": {
    "graph": ".graphwiki/graph.json",
    "wiki": ".graphwiki/wiki",
    "deltas": "graphwiki-out/deltas",
    "report": "graphwiki-out/GRAPH_REPORT.md",
    "svg": "graphwiki-out/graph.svg",
    "driftLog": "graphwiki-out/drift.log"
  },
  "extraction": {
    "mode": "standard",
    "extractor": "hybrid",
    "cache_dir": ".graphwiki/cache",
    "max_cache_age_ms": 86400000,
    "timeout_ms": 30000,
    "max_tokens": 4000
  },
  "wiki": {
    "format": "obsidian",
    "includeInferred": false,
    "communityLabels": true
  },
  "traversal": {
    "maxDepth": 5,
    "includeBidirectional": true
  },
  "graphModel": {
    "directed": false,
    "nodeTypes": ["function", "class", "module", "concept"],
    "edgeTypes": ["calls", "imports", "uses", "defines"]
  }
}
```

## paths Object

| Key | Type | Description |
|-----|------|-------------|
| `graph` | string | Graph JSON output |
| `wiki` | string | Wiki markdown directory |
| `deltas` | string | Delta log directory |
| `report` | string | Summary report file |
| `svg` | string | SVG export output |
| `driftLog` | string | Drift detector log |

## extraction Object

```json
{
  "mode": "standard" | "deep",
  "extractor": "ast" | "llm" | "hybrid",
  "cache_dir": ".graphwiki/cache",
  "max_cache_age_ms": 86400000,
  "timeout_ms": 30000,
  "max_tokens": 4000
}
```

- **mode**: `standard` (explicit) or `deep` (inferred)
- **extractor**: AST-only, LLM-only, or hybrid
- **max_cache_age_ms**: 24h default
- **timeout_ms**: Per-file timeout
- **max_tokens**: LLM token limit

## wiki Object

```json
{
  "format": "obsidian" | "plain",
  "includeInferred": false,
  "communityLabels": true
}
```

## graphModel Object

```json
{
  "directed": false,
  "nodeTypes": ["function", "class", "module", "concept"],
  "edgeTypes": ["calls", "imports", "uses", "defines"]
}
```

Partial config merges with defaults; missing fields use hardcoded values.
