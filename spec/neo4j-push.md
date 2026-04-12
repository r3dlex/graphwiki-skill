# Neo4j Push

Neo4j push synchronizes GraphDocument to a Neo4j instance via Bolt protocol.

## Usage

```bash
graphwiki build --neo4j
```

Or with custom connection:

```bash
graphwiki build --neo4j \
  --neo4j-uri bolt://localhost:7687 \
  --neo4j-user neo4j \
  --neo4j-password secret
```

Environment variables:

```bash
export NEO4J_URI=bolt://localhost:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=secret
graphwiki build --neo4j
```

## Connection

Bolt protocol client:

```typescript
import neo4j from 'neo4j-driver';

const driver = neo4j.driver(
  uri,
  neo4j.auth.basic(user, password)
);
```

Default: `bolt://localhost:7687` (Docker Neo4j standard port)

## Node Mapping

GraphNode → Neo4j Node:

```cypher
CREATE (n:GraphNode {
  id: "node-id",
  label: "Node Label",
  type: "function",
  confidence: "EXTRACTED",
  community: 1,
  properties: {...}
})
```

Node labels include:
- `:GraphNode` (all nodes)
- `:Function`, `:Class`, `:Module` (by type)
- `:Community_{id}` (by community)

## Edge Mapping

GraphEdge → Neo4j Relationship:

```cypher
MATCH (a:GraphNode {id: "source"}), (b:GraphNode {id: "target"})
CREATE (a)-[r:CALLS {
  weight: 0.85,
  confidence: "EXTRACTED"
}]->(b)
```

Relationship type = edge label (CALLS, IMPORTS, USES, etc.)

## Batch Operations

For large graphs:

1. Clear existing: `MATCH (n:GraphNode) DETACH DELETE n`
2. Create nodes in batches of 1000
3. Create edges in batches of 5000
4. Create indices for performance

```typescript
class Neo4jPusher {
  async push(doc: GraphDocument): Promise<void> {
    await this.clearGraph();
    await this.createNodeBatches(doc.nodes);
    await this.createEdgeBatches(doc.edges);
    await this.createIndices();
  }
}
```

Auto-created indices for id, type, community. Typical performance: ~1s for 1000 nodes/2000 edges.
