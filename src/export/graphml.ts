// GraphML export for GraphWiki v2
// Export format compatible with Gephi, yEd, and other graph tools

import type { GraphDocument, GraphNode, GraphEdge } from '../types.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

/**
 * Export graph as GraphML format
 */
export async function exportGraphML(
  graph: GraphDocument,
  outputPath: string
): Promise<void> {
  const graphml = generateGraphML(graph);
  await mkdir(join(outputPath, '..'), { recursive: true });
  await writeFile(outputPath, graphml, 'utf-8');
}

/**
 * Generate GraphML XML
 */
function generateGraphML(graph: GraphDocument): string {
  const lines: string[] = [];

  // XML declaration and GraphML header
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<graphml xmlns="http://graphml.graphdrawing.org/xmlns"');
  lines.push('  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
  lines.push('  xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns');
  lines.push('  http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">');
  lines.push('');

  // Key definitions (attributes)
  lines.push('  <!-- Node attributes -->');
  lines.push('  <key id="label" for="node" attr.name="label" attr.type="string"/>');
  lines.push('  <key id="type" for="node" attr.name="type" attr.type="string"/>');
  lines.push('  <key id="community" for="node" attr.name="community" attr.type="int"/>');
  lines.push('  <key id="source_file" for="node" attr.name="source_file" attr.type="string"/>');
  lines.push('  <key id="provenance" for="node" attr.name="provenance" attr.type="string"/>');
  lines.push('');

  lines.push('  <!-- Edge attributes -->');
  lines.push('  <key id="weight" for="edge" attr.name="weight" attr.type="double"/>');
  lines.push('  <key id="edge_label" for="edge" attr.name="label" attr.type="string"/>');
  lines.push('  <key id="edge_provenance" for="edge" attr.name="provenance" attr.type="string"/>');
  lines.push('');

  // Graph definition
  const nodeCount = graph.nodes.length;
  const edgeCount = graph.edges.length;
  lines.push(`  <graph id="G" edgedefault="directed" nodes="${nodeCount}" edges="${edgeCount}">`);
  lines.push('');

  // Nodes
  for (const node of graph.nodes) {
    lines.push(generateGraphMLNode(node));
  }

  // Edges
  for (const edge of graph.edges) {
    lines.push(generateGraphMLEdge(edge));
  }

  lines.push('  </graph>');
  lines.push('</graphml>');

  return lines.join('\n');
}

/**
 * Generate GraphML node element
 */
function generateGraphMLNode(node: GraphNode): string {
  const id = escapeXml(node.id);
  const label = escapeXml(node.label || node.id);
  const type = escapeXml(node.type || 'unknown');
  const community = node.community !== undefined ? String(node.community) : '';
  const sourceFile = escapeXml(node.source_file || '');
  const provenance = escapeXml(JSON.stringify(node.provenance || []));

  return `    <node id="${id}">
      <data key="label">${label}</data>
      <data key="type">${type}</data>${community ? `\n      <data key="community">${community}</data>` : ''}${sourceFile ? `\n      <data key="source_file">${sourceFile}</data>` : ''}
      <data key="provenance">${provenance}</data>
    </node>`;
}

/**
 * Generate GraphML edge element
 */
function generateGraphMLEdge(edge: GraphEdge): string {
  const id = escapeXml(edge.id);
  const source = escapeXml(edge.source);
  const target = escapeXml(edge.target);
  const weight = edge.weight;
  const label = escapeXml(edge.label || '');
  const provenance = escapeXml(JSON.stringify(edge.provenance || []));

  return `    <edge id="${id}" source="${source}" target="${target}">
      <data key="weight">${weight}</data>${label ? `\n      <data key="edge_label">${label}</data>` : ''}
      <data key="edge_provenance">${provenance}</data>
    </edge>`;
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Export graph to GraphML format
 */
export async function exportToGraphML(
  graph: GraphDocument,
  outputDir = 'graphwiki-out/exports'
): Promise<string> {
  const outputPath = join(outputDir, 'graph.graphml');
  await exportGraphML(graph, outputPath);
  return outputPath;
}
