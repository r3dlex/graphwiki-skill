# Tree-Sitter Parser

Tree-sitter parser enables AST extraction for 20+ programming languages via optional dependencies and per-loader try/catch error handling.

## Language Support Matrix

| Language | Library | Status |
|----------|---------|--------|
| TypeScript | tree-sitter-typescript | Optional |
| JavaScript | tree-sitter-javascript | Optional |
| Python | tree-sitter-python | Optional |
| Go | tree-sitter-go | Optional |
| Rust | tree-sitter-rust | Optional |
| Java | tree-sitter-java | Optional |
| C++ | tree-sitter-cpp | Optional |
| C# | tree-sitter-c-sharp | Optional |
| Ruby | tree-sitter-ruby | Optional |
| PHP | tree-sitter-php | Optional |
| Swift | tree-sitter-swift | Optional |
| Kotlin | tree-sitter-kotlin | Optional |
| SQL | tree-sitter-sql | Optional |

## Grammar Loading Strategy

Each language loads grammar with try/catch wrapper:

```typescript
async function loadGrammar(language: string): Promise<Language> {
  try {
    const wasmPath = require.resolve(`tree-sitter-${language}/tree-sitter-${language}.wasm`);
    const parser = new Parser();
    const language = await Grammar.load(wasmPath);
    parser.setLanguage(language);
    return language;
  } catch (err) {
    console.warn(`[TreeSitter] Grammar unavailable: ${language}`);
    return null; // Gracefully degrade
  }
}
```

## Per-Loader Try/Catch

Each language loader catches errors independently:

```typescript
class TreeSitterParser {
  async extractFromFile(filePath: string): Promise<GraphDocument> {
    const language = getLanguageFromPath(filePath);
    
    try {
      const grammar = await loadGrammar(language);
      if (!grammar) throw new Error(`Grammar not available: ${language}`);
      const ast = parseWithGrammar(content, grammar);
      return this.traverse(ast);
    } catch (err) {
      this.logger.warn(`[${language}] Extraction failed: ${err.message}`);
      return { nodes: [], edges: [] }; // Return empty graph
    }
  }
}
```

## WASM vs Native

- **WASM** (default): Portable, safe, slower
- **Native** (via `--parser=native`): Fast, platform-specific

## API

```typescript
class TreeSitterParser {
  extractFromFile(filePath: string): Promise<GraphDocument>;
  extractFromString(content: string, language: string): Promise<GraphDocument>;
  supportsLanguage(language: string): boolean;
  getAvailableLanguages(): string[];
}
```

## Fallback Behavior

If grammar unavailable:
- Return empty graph document
- Log warning (non-fatal)
- Continue processing other files
- LLM extractor can supplement AST results
