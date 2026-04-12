# Graph Model

GraphDocument defines the core schema for nodes, edges, and metadata with optional confidence field.

## GraphNode Schema

```typescript
interface GraphNode {
  id: string;                    // Unique identifier (UUID or namespaced)
  label: string;                 // Human-readable name
  type: NodeType;                // Semantic type
  properties?: Record<string, unknown>;  // Custom attributes
  provenance?: string[];         // Source files/extraction method
  source_file?: string;          // Primary source
  community?: number;            // Community ID for clustering
  embedding?: number[];          // Vector representation
  confidence?: ConfidenceLevel;  // EXTRACTED | INFERRED | AMBIGUOUS
}

type NodeType =
  | "function"
  | "class"
  | "module"
  | "interface"
  | "type"
  | "concept"
  | "entity"
  | "document";
```

## GraphEdge Schema

```typescript
interface GraphEdge {
  id: string;                    // Unique edge ID
  source: string;                // Source node ID
  target: string;                // Target node ID
  weight: number;                // Strength/relevance [0, 1]
  label?: string;                // Relation description
  provenance?: string[];         // Extraction sources
  directed?: boolean;            // Directional constraint
  confidence?: ConfidenceLevel;  // EXTRACTED | INFERRED | AMBIGUOUS
}

type EdgeRelation =
  | "calls"
  | "imports"
  | "uses"
  | "defines"
  | "implements"
  | "extends"
  | "depends_on"
  | "semantically_similar_to"
  | "related_to";
```

## GraphDocument Schema

```typescript
interface GraphDocument {
  id?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata?: {
    completeness?: number;       // [0, 1] extraction coverage
    source?: string;             // Generator or import source
    generated_at?: string;       // ISO 8601 timestamp
    directed?: boolean;          // Graph directionality
    [key: string]: unknown;      // Custom metadata
  };
}
```

## Confidence Field

Optional `confidence` on nodes and edges indicates extraction quality:

```typescript
type ConfidenceLevel = "EXTRACTED" | "INFERRED" | "AMBIGUOUS";
```

**EXTRACTED**: Explicitly present in source code
**INFERRED**: Derived from context or LLM analysis
**AMBIGUOUS**: Multiple valid interpretations

## Type Definitions

Node types: function, class, module, interface, type, concept, entity, document. Edge relations: calls, imports, uses, defines, implements, extends, depends_on, semantically_similar_to.
