# LLM Extractor

LLM extraction pipeline uses language models to derive GraphDocument from unstructured content.

## Extraction Modes

### Standard Mode

Default prompt focuses on explicit entities and relations:

```
Extract entities and relationships from:
[content]

Format as JSON:
{
  "entities": [{"id": "...", "type": "...", "label": "..."}],
  "relations": [{"source": "...", "target": "...", "type": "..."}]
}
```

Confidence: EXTRACTED

### Deep Mode

Augmented prompt infers implicit relations and concepts:

```
Deeply analyze [content] for:
1. Explicit entities and relations (EXTRACTED)
2. Implied concepts and reasoning (INFERRED)
3. Knowledge gaps and ambiguities (AMBIGUOUS)

Return confidence_level for each relation.
```

Confidence: EXTRACTED, INFERRED, AMBIGUOUS

## Confidence Scores

```typescript
type ConfidenceLevel = "EXTRACTED" | "INFERRED" | "AMBIGUOUS";

interface ExtractedRelation {
  source: string;
  target: string;
  type: EdgeRelation;
  confidence_level: ConfidenceLevel;
  explanation?: string;
}
```

| Level | Meaning | Use Case |
|-------|---------|----------|
| EXTRACTED | Explicitly stated | High confidence in graph |
| INFERRED | Implied or logical | Include with caution |
| AMBIGUOUS | Multiple interpretations | Flag for review |

## API

```typescript
class LLMExtractor {
  extract(content: string, mode: 'standard' | 'deep'): Promise<ExtractionResult>;
  extractWithConfidence(content: string): Promise<ConfidenceScore[]>;
}

interface ExtractionResult {
  document: GraphDocument;
  tokensUsed: number;
  mode: string;
  duration: number;
}
```

## Rate Limiting

Respects provider rate limits via DispatcherConfig:
- `requests_per_minute`
- `burst_limit`
- Exponential backoff on 429 responses
- Circuit breaker on repeated failures
