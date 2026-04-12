# Ignore Resolver

Ignore resolver handles two complementary ignore mechanisms: `.graphwikiignore` (extraction-time) and `.graphifyignore` (output-time).

## .graphwikiignore — Extraction Filter

Excludes files from extraction phase (before AST/LLM processing).

**When used:** Source code optimization
**Scope:** Prevents expensive extraction on known-irrelevant files

```
# .graphwikiignore
node_modules/
dist/
*.test.ts
__pycache__/
.venv/
```

Files matching `.graphwikiignore` are:
- Never extracted
- Not parsed
- Not included in graph
- **Reduces token usage** (LLM extractor never sees them)

## .graphifyignore — Output Filter

Excludes already-extracted nodes from output (after extraction, before wiki compilation).

**When used:** Curating public wikis
**Scope:** Filters nodes from results without re-extracting

```
# .graphifyignore
**/internal/**
**/private/**
ToxicTrait
ConfigSecret
```

Files matching `.graphifyignore` are:
- Extracted and cached
- Filtered from output
- Excluded from wiki compilation
- **Allows fast curation** (no re-extraction needed)

## Glob Pattern Syntax

Both use `.gitignore`-style glob patterns:

```
*.test.ts          # Match extension anywhere
src/internal/**    # Match directory tree
!src/important.ts  # Negation (keep files matching)
node_modules/      # Trailing slash matches directories
```

## API

```typescript
class IgnoreResolver {
  resolveGraphwikiIgnore(cwd: string): Promise<string[]>;
  resolveGraphifyIgnore(cwd: string): Promise<string[]>;
  matchesGraphwikiIgnore(filePath: string): boolean;
  matchesGraphifyIgnore(nodeId: string): boolean;
}
```

## Semantic Difference

| Aspect | .graphwikiignore | .graphifyignore |
|--------|-----------------|-----------------|
| Phase | Extraction | Output |
| Effect | Prevents processing | Filters results |
| Performance | Saves tokens | Fast |
| Use case | Optimizing builds | Curating content |
| Recurrence | Re-extract clears | Re-filter only |
