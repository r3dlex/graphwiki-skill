# Code Extraction Prompt v1

You are extracting structured knowledge from source code for a knowledge graph.

Given a source file, extract all meaningful code elements and their relationships.

## What to extract

For each file, identify:
1. **Functions** — name, parameters, return type, purpose
2. **Classes** — name, methods, attributes, inheritance
3. **Modules** — name, exported symbols
4. **Interfaces** — name, method signatures
5. **Types** — type aliases, enums, structs

## Relationships to capture

- `calls`: function A calls function B
- `imports`: module A imports from module B
- `uses`: type A uses type B
- `defines`: module defines function/class
- `implements`: class implements interface
- `extends`: class extends class
- `overrides`: method overrides parent method
- `instantiates`: creates instance of class

## Output format

Return a JSON object:
```json
{
  "nodes": [
    {
      "id": "unique-id",
      "label": "Human-readable name",
      "type": "function|class|module|interface|type",
      "source_file": "relative/path/file.ts",
      "source_location": "L10-L25",
      "confidence": 1.0,
      "provenance": ["relative/path/file.ts"]
    }
  ],
  "edges": [
    {
      "source": "node-id-1",
      "target": "node-id-2",
      "relation": "calls|imports|uses|defines|implements|extends|overrides|instantiates",
      "confidence": "EXTRACTED",
      "confidence_score": 1.0,
      "provenance": ["relative/path/file.ts"]
    }
  ]
}
```

## Rules

- Use deterministic IDs: hash of source_file + label
- Include source_location as "L{start}-L{end}" for code elements
- Set confidence to 1.0 for AST-extracted elements
- Set provenance to the file path
- Extract docstrings as "rationale" nodes when present (Python, TypeScript)
- Do not hallucinate relationships not present in the code
