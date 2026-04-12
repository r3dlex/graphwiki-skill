# Graph Traversal

Graph traversal provides BFS, DFS, and shortest-path algorithms for both directed and undirected graphs.

## Traversal Algorithms

### Breadth-First Search (BFS)

```typescript
bfs(startNode: string, maxDepth?: number): string[]
```

Visits nodes level-by-level, useful for:
- Neighbors within N hops
- Breadth-limited exploration
- Shortest paths in unweighted graphs

### Depth-First Search (DFS)

```typescript
dfs(startNode: string, maxDepth?: number): string[]
```

Visits nodes recursively, useful for:
- Finding all reachable nodes
- Cycle detection
- Topological sorting

### Shortest Path

```typescript
shortestPath(start: string, end: string): ShortestPathResult
```

Returns:
```typescript
interface ShortestPathResult {
  path: string[];
  distance: number;
  weight: number;
}
```

Uses Dijkstra's algorithm for weighted graphs, BFS for unweighted.

## Direction Enforcement

When `metadata.directed === true`:

- Edges have direction (`source → target`)
- Traversal respects edge direction
- Reverse traversal uses backward edges

When `metadata.directed === false`:

- Edges are bidirectional
- Traversal flows in both directions
- No distinction between source/target

## API Surface

```typescript
interface GraphTraversal {
  bfs(startId: string, options?: TraversalOptions): string[];
  dfs(startId: string, options?: TraversalOptions): string[];
  shortestPath(start: string, end: string): ShortestPathResult;
  neighbors(nodeId: string, depth?: number): string[];
  isReachable(start: string, end: string): boolean;
}

interface TraversalOptions {
  maxDepth?: number;
  filter?: (node: GraphNode) => boolean;
}
```

## Complexity

| Algorithm | Time | Space |
|-----------|------|-------|
| BFS | O(V + E) | O(V) |
| DFS | O(V + E) | O(V) |
| Dijkstra | O((V + E)log V) | O(V) |

## Cache Strategy

Traversal results are cached per-graph version. Cache invalidates on:
- Node addition/removal
- Edge modification
- Metadata changes
