# Directed Graphs

Directed graph mode enforces edge directionality and enables DAG (directed acyclic graph) support.

## Usage

```bash
graphwiki build --directed
```

Or via config:

```json
{
  "graphModel": {
    "directed": true
  }
}
```

## Metadata

Stored in GraphDocument:

```typescript
interface GraphDocument {
  metadata?: {
    directed?: boolean;  // true for directed, false for undirected
  };
}
```

When `directed: true`:
- Edges have source → target direction
- Traversal respects edge direction
- No reverse edges auto-created

## Edge Behavior

### Undirected (default)

Edge `A → B` means:
- A calls B
- B is called by A (implicit reverse)

Traversal flows both ways.

### Directed

Edge `A → B` means:
- A calls B
- B is NOT called by A
- Reverse must be explicit edge

```typescript
// Directed mode
edges: [
  { source: "A", target: "B", label: "calls" },
  { source: "B", target: "A", label: "called_by" }  // Separate edge
]
```

Traversal respects direction (forward/backward/both). DAG validation detects cycles and provides topological sort. Use cases: call graphs, dependency graphs, inheritance hierarchies. Default `metadata.directed: false` for backward compatibility.
