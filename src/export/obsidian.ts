// Obsidian vault export for GraphWiki v2

import type { GraphDocument, GraphNode } from '../types.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

/**
 * Export graph as Obsidian vault
 */
export async function exportObsidian(
  graph: GraphDocument,
  vaultPath: string
): Promise<void> {
  // Create vault directory structure
  await mkdir(join(vaultPath, 'nodes'), { recursive: true });
  await mkdir(join(vaultPath, 'graphs'), { recursive: true });

  // Export each node as a note
  for (const node of graph.nodes) {
    await exportNodeAsNote(node, graph, vaultPath);
  }

  // Export graph.canvas
  await exportGraphCanvas(graph, vaultPath);

  // Export index
  await exportIndex(graph, vaultPath);
}

/**
 * Export a single node as an Obsidian note
 */
async function exportNodeAsNote(
  node: GraphNode,
  graph: GraphDocument,
  vaultPath: string
): Promise<void> {
  const filename = sanitizeFilename(node.label || node.id) + '.md';
  const filepath = join(vaultPath, 'nodes', filename);

  const content = generateNoteContent(node, graph);
  await writeFile(filepath, content, 'utf-8');
}

/**
 * Generate markdown content for a node note
 */
function generateNoteContent(node: GraphNode, graph: GraphDocument): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`id: ${node.id}`);
  lines.push(`type: ${node.type || 'unknown'}`);
  lines.push(`label: ${node.label || node.id}`);
  if (node.community !== undefined) {
    lines.push(`community: ${node.community}`);
  }
  if (node.provenance && node.provenance.length > 0) {
    lines.push(`provenance:`);
    for (const prov of node.provenance) {
      lines.push(`  - ${prov}`);
    }
  }
  lines.push('---');
  lines.push('');

  // Title
  lines.push(`# ${node.label || node.id}`);
  lines.push('');

  // Type badge
  lines.push(`![[${node.type || 'unknown'}]]`);
  lines.push('');

  // Neighbors (edges)
  const outgoing = graph.edges.filter(e => e.source === node.id);
  const incoming = graph.edges.filter(e => e.target === node.id);

  if (outgoing.length > 0) {
    lines.push('## Calls / References');
    for (const edge of outgoing) {
      const targetNode = graph.nodes.find(n => n.id === edge.target);
      if (targetNode) {
        lines.push(`- [[${targetNode.label || targetNode.id}]]${edge.label ? ` (${edge.label})` : ''}`);
      }
    }
    lines.push('');
  }

  if (incoming.length > 0) {
    lines.push('## Called By / Referenced By');
    for (const edge of incoming) {
      const sourceNode = graph.nodes.find(n => n.id === edge.source);
      if (sourceNode) {
        lines.push(`- [[${sourceNode.label || sourceNode.id}]]`);
      }
    }
    lines.push('');
  }

  // Properties
  if (node.properties && Object.keys(node.properties).length > 0) {
    lines.push('## Properties');
    for (const [key, value] of Object.entries(node.properties)) {
      lines.push(`- **${key}**: ${JSON.stringify(value)}`);
    }
    lines.push('');
  }

  // Source file
  if (node.source_file) {
    lines.push('## Source');
    lines.push(`Source: \`${node.source_file}\``);
    lines.push('');
  }

  // Related nodes in same community
  if (node.community !== undefined) {
    const communityMembers = graph.nodes.filter(
      n => n.community === node.community && n.id !== node.id
    );
    if (communityMembers.length > 0) {
      lines.push('## Community');
      for (const member of communityMembers.slice(0, 10)) {
        lines.push(`- [[${member.label || member.id}]]`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Export graph as Obsidian graph.canvas
 */
async function exportGraphCanvas(
  graph: GraphDocument,
  vaultPath: string
): Promise<void> {
  const canvas = generateGraphCanvas(graph);
  const filepath = join(vaultPath, 'graphs', 'graph.canvas');
  await writeFile(filepath, canvas, 'utf-8');
}

/**
 * Generate graph.canvas format
 */
function generateGraphCanvas(graph: GraphDocument): string {
  const nodes = graph.nodes.map((node, index) => {
    const x = 100 + (index % 5) * 200;
    const y = 100 + Math.floor(index / 5) * 150;
    return {
      id: node.id,
      type: 'file',
      file: `nodes/${sanitizeFilename(node.label || node.id)}.md`,
      x,
      y,
      width: 200,
      height: 50,
    };
  });

  const lines = graph.edges.map(edge => {
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);
    if (!sourceNode || !targetNode) return null;

    return {
      id: edge.id,
      type: 'line',
      fromX: sourceNode.x + 100,
      fromY: sourceNode.y + 25,
      toX: targetNode.x + 100,
      toY: targetNode.y + 25,
      color: '#0f3460',
    };
  }).filter(Boolean);

  const canvas = {
    nodes,
    edges: lines,
  };

  return JSON.stringify(canvas, null, 2);
}

/**
 * Export index note
 */
async function exportIndex(graph: GraphDocument, vaultPath: string): Promise<void> {
  const lines: string[] = [];

  lines.push('---');
  lines.push('type: index');
  lines.push('---');
  lines.push('');
  lines.push('# GraphWiki Index');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`## Statistics`);
  lines.push(`- Nodes: ${graph.nodes.length}`);
  lines.push(`- Edges: ${graph.edges.length}`);
  lines.push(`- Communities: ${new Set(graph.nodes.map(n => n.community)).size}`);
  lines.push('');

  // Group by type
  const byType = new Map<string, GraphNode[]>();
  for (const node of graph.nodes) {
    const type = node.type || 'unknown';
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type)!.push(node);
  }

  lines.push('## By Type');
  for (const [type, nodes] of byType) {
    lines.push(`### ${type} (${nodes.length})`);
    for (const node of nodes.slice(0, 20)) {
      lines.push(`- [[${sanitizeFilename(node.label || node.id)}]]`);
    }
    if (nodes.length > 20) {
      lines.push(`- ... and ${nodes.length - 20} more`);
    }
    lines.push('');
  }

  // Community index
  const byCommunity = new Map<number, GraphNode[]>();
  for (const node of graph.nodes) {
    if (node.community !== undefined) {
      if (!byCommunity.has(node.community)) byCommunity.set(node.community, []);
      byCommunity.get(node.community)!.push(node);
    }
  }

  lines.push('## By Community');
  for (const [community, nodes] of byCommunity) {
    lines.push(`### Community ${community} (${nodes.length})`);
    for (const node of nodes.slice(0, 10)) {
      lines.push(`- [[${sanitizeFilename(node.label || node.id)}]]`);
    }
    lines.push('');
  }

  lines.push('## Graph View');
  lines.push('![[graphs/graph.canvas]]');

  const filepath = join(vaultPath, 'index.md');
  await writeFile(filepath, lines.join('\n'), 'utf-8');
}

/**
 * Sanitize filename for Obsidian
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100);
}

/**
 * Export graph to Obsidian vault
 */
export async function exportToObsidian(
  graph: GraphDocument,
  vaultPath = 'graphwiki-out/obsidian-vault'
): Promise<void> {
  await exportObsidian(graph, vaultPath);
}
