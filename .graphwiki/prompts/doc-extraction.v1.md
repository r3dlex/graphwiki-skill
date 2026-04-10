# Document Extraction Prompt v1

You are extracting structured knowledge from documents for a knowledge graph.

Given a document (markdown, PDF, DOCX, etc.), extract semantic knowledge.

## What to extract

1. **Concepts** — key ideas, patterns, architectural decisions
2. **Entities** — specific names, proper nouns, tool names
3. **Rationale** — reasons behind decisions, "why" statements
4. **Decisions** — architectural choices, design patterns used
5. **Comparisons** — comparing approaches, tradeoffs

## Relationships to capture

- `related_to`: concept A is related to concept B
- `depends_on`: decision A depends on decision B
- `rationale_for`: explanation for a decision
- `contradicts`: A contradicts B
- `semantically_similar_to`: A is similar to B (use sparingly)

## Output format

Return a JSON object:
```json
{
  "nodes": [
    {
      "id": "unique-id",
      "label": "Human-readable name",
      "type": "concept|entity|rationale|decision|comparison",
      "source_file": "relative/path/doc.md",
      "confidence": 0.8,
      "provenance": ["relative/path/doc.md"]
    }
  ],
  "edges": [
    {
      "source": "node-id-1",
      "target": "node-id-2",
      "relation": "related_to|depends_on|rationale_for|contradicts|semantically_similar_to",
      "confidence": "INFERRED",
      "confidence_score": 0.7,
      "provenance": ["relative/path/doc.md"]
    }
  ]
}
```

## Rules

- Use INFERRED confidence for LLM-deduced relationships
- Include relevant quotes from the document in provenance
- Mark uncertain extractions with lower confidence scores (0.4-0.7)
- Cross-reference with other documents when appropriate
