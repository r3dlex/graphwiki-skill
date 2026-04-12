# Obsidian Output

Obsidian output format generates a vault compatible with Obsidian.md via [[wikilinks]] syntax and graph.canvas visualization.

## Vault Layout

```
.graphwiki/wiki/
  graph.canvas              # Visual graph (Obsidian Canvas)
  node-label-1.md           # Node 1 (auto-slugified)
  node-label-2.md           # Node 2
  ...
  README.md                 # Index of all nodes
```

## Markdown File Format

Each node becomes a `.md` file with YAML frontmatter and wikilinks to related nodes:

```yaml
---
aliases: ["AuthService", "auth-service"]
tags: ["type:class", "community:auth", "confidence:EXTRACTED"]
---

# AuthService

Implementation with [[loginUser]], [[validateToken]], [[JWTProvider]], [[DatabasePool]].
```

## [[wikilinks]] Syntax

Obsidian-compatible linking:

```markdown
[[TargetNode]]              # Simple link
[[TargetNode|alias]]        # Custom display text
[[File#section]]            # Section reference
[[File#^blockid]]           # Block reference
```

Relations are rendered as nested markdown lists.

## graph.canvas JSON

Obsidian Canvas format for visual graph browsing:

```json
{
  "nodes": [
    {
      "id": "uuid-1",
      "type": "file",
      "file": "wiki/AuthService.md",
      "x": 0,
      "y": 0,
      "width": 250,
      "height": 60
    },
    {
      "id": "uuid-2",
      "type": "text",
      "text": "Legend: Functions, Classes, Modules",
      "x": 100,
      "y": -300,
      "width": 200,
      "height": 80
    }
  ],
  "edges": [
    {
      "id": "edge-uuid",
      "fromNode": "uuid-1",
      "toNode": "uuid-2",
      "fromSide": "right",
      "toSide": "left",
      "label": "calls"
    }
  ]
}
```

## Canvas Positioning

Force-directed layout clusters communities, with edge distance inverse to weight. Node IDs slugified to filenames; tags track type, community, confidence. Auto-generated README.md indexes all nodes.
