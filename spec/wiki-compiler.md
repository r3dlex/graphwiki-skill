# WikiCompiler

WikiCompiler transforms a GraphDocument into Obsidian vault format with [[wikilinks]] syntax and graph.canvas JSON structure.

## Output Format

WikiCompiler generates:
- `.graphwiki/wiki/` — Markdown files with YAML frontmatter
- `.graphwiki/wiki/graph.canvas` — Obsidian Canvas JSON for visual graph layout

## Markdown Files

Each node becomes a `.md` file:

```yaml
---
aliases: [Node ID, alternate names]
tags: [type, community]
created: ISO 8601 timestamp
updated: ISO 8601 timestamp
---

# Node Label

Node description and properties.

## Related Nodes

[[target1]] — relation description
[[target2]] — relation description
```

## Obsidian Canvas Format

`graph.canvas` is a JSON file with nodes and edges:

```json
{
  "nodes": [
    {
      "id": "node-uuid",
      "type": "file",
      "file": "wiki/node-label.md",
      "x": 0,
      "y": 0,
      "width": 250,
      "height": 60
    }
  ],
  "edges": [
    {
      "id": "edge-uuid",
      "fromNode": "node1-id",
      "toNode": "node2-id",
      "fromSide": "right",
      "toSide": "left",
      "label": "calls"
    }
  ]
}
```

## WikiLink Syntax

Relations use double-bracket Obsidian syntax:

```markdown
[[Target Node|display text]]
[[ClassName#method|method reference]]
```

## Frontmatter Fields

| Field | Type | Purpose |
|-------|------|---------|
| `aliases` | string[] | Node ID + alternate names for search |
| `tags` | string[] | Node type and community ID |
| `created` | ISO 8601 | Creation timestamp |
| `updated` | ISO 8601 | Last modification timestamp |

## Clustering & Layout

Canvas nodes are positioned using community detection:
- Nodes in same community cluster together
- Force-directed layout prevents overlap
- Edge bundling reduces visual clutter

## API

```typescript
class WikiCompiler {
  compile(doc: GraphDocument, options?: WikiOptions): Promise<void>;
  private generateMarkdown(node: GraphNode): string;
  private generateCanvas(doc: GraphDocument): Canvas;
}
```
