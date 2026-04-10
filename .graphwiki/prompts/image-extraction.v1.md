# Image Extraction Prompt v1

You are extracting structured knowledge from diagrams and images for a knowledge graph.

Given an image containing a diagram, extract all visible elements and relationships.

## What to extract

1. **Entities** — boxes, components, actors, processes
2. **Relationships** — arrows, lines connecting entities
3. **Labels** — text labels on entities and relationships
4. **Containers** — groups, clusters, swimlanes

## Relationships to capture

- `uses`: component A uses component B
- `calls`: process A calls process B
- `contains`: container A contains entity B
- `related_to`: loosely related elements

## Output format

```json
{
  "nodes": [
    {
      "id": "unique-id",
      "label": "Label text",
      "type": "entity",
      "source_file": "relative/path/diagram.png",
      "confidence": 0.8,
      "provenance": ["relative/path/diagram.png"]
    }
  ],
  "edges": [
    {
      "source": "node-id-1",
      "target": "node-id-2",
      "relation": "uses|calls|contains|related_to",
      "confidence": "INFERRED",
      "confidence_score": 0.7,
      "provenance": ["relative/path/diagram.png"]
    }
  ]
}
```

## Rules

- Describe diagram elements as accurately as possible
- Use INFERRED confidence for implied relationships
- Mark unclear elements with lower confidence
