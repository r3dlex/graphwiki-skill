// Neo4j Cypher export for GraphWiki v2

import type { GraphDocument, GraphNode, GraphEdge } from '../types.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

/**
 * Export graph as Neo4j Cypher statements
 */
export async function exportNeo4j(
  graph: GraphDocument,
  outputPath: string
): Promise<void> {
  const cypher = generateCypher(graph);
  await mkdir(join(outputPath, '..'), { recursive: true });
  await writeFile(outputPath, cypher, 'utf-8');
}

/**
 * Generate Cypher CREATE statements
 */
function generateCypher(graph: GraphDocument): string {
  const lines: string[] = [];

  // Header comment
  lines.push('// GraphWiki v2 - Neo4j Cypher Export');
  lines.push(`// Generated: ${new Date().toISOString()}`);
  lines.push(`// Nodes: ${graph.nodes.length}, Edges: ${graph.edges.length}`);
  lines.push('');

  // Create nodes
  lines.push('// === Create Nodes ===');
  lines.push('');

  for (const node of graph.nodes) {
    lines.push(generateNodeCreate(node));
  }

  lines.push('');
  lines.push('// === Create Relationships ===');
  lines.push('');

  // Create relationships
  for (const edge of graph.edges) {
    lines.push(generateRelationshipCreate(edge));
  }

  lines.push('');
  lines.push('// === Create Indexes ===');
  lines.push('');
  lines.push('CREATE INDEX node_id_index IF NOT EXISTS FOR (n:GraphNode) ON (n.id);');
  lines.push('CREATE INDEX node_type_index IF NOT EXISTS FOR (n:GraphNode) ON (n.type);');
  lines.push('CREATE INDEX node_community_index IF NOT EXISTS FOR (n:GraphNode) ON (n.community);');
  lines.push('CREATE INDEX node_label_index IF NOT EXISTS FOR (n:GraphNode) ON (n.label);');

  lines.push('');
  lines.push('// === Done ===');

  return lines.join('\n');
}

/**
 * Generate Cypher CREATE statement for a node
 */
function generateNodeCreate(node: GraphNode): string {
  const _id = escapeCypherString(node.id);
  const label = node.type ? escapeCypherString(node.type) : 'GraphNode';

  const props: string[] = [];
  props.push(`id: ${escapeCypherString(node.id)}`);
  props.push(`label: ${escapeCypherString(node.label || node.id)}`);

  if (node.type) {
    props.push(`type: ${escapeCypherString(node.type)}`);
  }

  if (node.community !== undefined) {
    props.push(`community: ${node.community}`);
  }

  if (node.source_file) {
    props.push(`source_file: ${escapeCypherString(node.source_file)}`);
  }

  if (node.provenance && node.provenance.length > 0) {
    props.push(`provenance: ${JSON.stringify(node.provenance)}`);
  }

  if (node.properties) {
    for (const [key, value] of Object.entries(node.properties)) {
      props.push(`${key}: ${JSON.stringify(value)}`);
    }
  }

  const propsStr = props.join(', ');
  return `CREATE (n:${label} {${propsStr}});`;
}

/**
 * Generate Cypher CREATE statement for a relationship
 */
function generateRelationshipCreate(edge: GraphEdge): string {
  const sourceId = escapeCypherString(edge.source);
  const targetId = escapeCypherString(edge.target);
  const relType = escapeCypherString(edge.label || 'RELATES_TO').toUpperCase().replace(/\s+/g, '_');

  const props: string[] = [];
  props.push(`id: ${escapeCypherString(edge.id)}`);
  props.push(`weight: ${edge.weight}`);

  if (edge.provenance && edge.provenance.length > 0) {
    props.push(`provenance: ${JSON.stringify(edge.provenance)}`);
  }

  const propsStr = props.length > 0 ? ` { ${props.join(', ')} }` : '';

  return `MATCH (a {id: ${sourceId}}), (b {id: ${targetId}}) CREATE (a)-[r:${relType}${propsStr}]->(b);`;
}

/**
 * Escape string for Cypher
 */
function escapeCypherString(str: string): string {
  if (str === null || str === undefined) return 'null';
  return `'${String(str).replace(/'/g, "\\'")}'`;
}

/**
 * Generate parameter file for import
 */
function _generateImportParams(graph: GraphDocument): string {
  return JSON.stringify(
    {
      nodes: graph.nodes.map(n => ({
        id: n.id,
        label: n.label,
        type: n.type,
        community: n.community,
        properties: n.properties,
      })),
      edges: graph.edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        weight: e.weight,
        label: e.label,
      })),
    },
    null,
    2
  );
}

/**
 * Export to Neo4j Cypher format
 */
export async function exportToNeo4j(
  graph: GraphDocument,
  outputDir = 'graphwiki-out/exports'
): Promise<string> {
  const cypherPath = join(outputDir, 'neo4j-export.cypher');
  await exportNeo4j(graph, cypherPath);
  return cypherPath;
}
