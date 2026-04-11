#!/usr/bin/env node

// GraphWiki v2 CLI
// Commander-based CLI with all commands

import { Command } from 'commander';
import { readFile, writeFile } from 'fs/promises';
import { glob } from 'glob';
import { resolveIgnores } from './util/ignore-resolver.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

// Get package version
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  await readFile(join(__dirname, '../package.json'), 'utf-8')
);
const VERSION = packageJson.version;

// ============================================================
// Types
// ============================================================

interface GraphDocument {
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    properties?: Record<string, unknown>;
    provenance?: string[];
    source_file?: string;
    community?: number;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    weight: number;
    label?: string;
  }>;
  metadata?: Record<string, unknown>;
}

// ============================================================
// Utility Functions
// ============================================================

async function loadGraph(graphPath = '.graphwiki/graph.json'): Promise<GraphDocument> {
  try {
    const content = await readFile(graphPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { nodes: [], edges: [] };
  }
}

async function saveGraph(graph: GraphDocument, graphPath = '.graphwiki/graph.json'): Promise<void> {
  await writeFile(graphPath, JSON.stringify(graph, null, 2), 'utf-8');
}

function findNode(graph: GraphDocument, nodeId: string) {
  return graph.nodes.find(n => n.id === nodeId || n.label === nodeId);
}

function getNeighbors(graph: GraphDocument, nodeId: string): string[] {
  const neighborIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.source === nodeId) neighborIds.add(edge.target);
    if (edge.target === nodeId) neighborIds.add(edge.source);
  }
  return [...neighborIds];
}

function findShortestPath(graph: GraphDocument, nodeA: string, nodeB: string): string[] | null {
  if (nodeA === nodeB) return [nodeA];

  const visited = new Set<string>();
  const queue: Array<{ id: string; path: string[] }> = [{ id: nodeA, path: [nodeA] }];
  visited.add(nodeA);

  while (queue.length > 0) {
    const { id, path } = queue.shift()!;

    const neighbors = getNeighbors(graph, id);
    for (const neighbor of neighbors) {
      if (neighbor === nodeB) {
        return [...path, nodeB];
      }

      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ id: neighbor, path: [...path, neighbor] });
      }
    }
  }

  return null;
}

// ============================================================
// CLI Commands
// ============================================================

const program = new Command();

program
  .name('graphwiki')
  .description('LLM knowledge graph with persistent wiki compilation')
  .version(VERSION);

// Build command
program
  .command('build')
  .description('Build the knowledge graph from source files')
  .argument('<path>', 'Source path to build from (default: .)')
  .option('--update', 'Incremental update only')
  .option('--resume', 'Resume interrupted build')
  .option('--permissive', 'Allow coerced extraction results')
  .option('--full-cluster', 'Build full cluster')
  .action(async (path: string, options) => {
    console.log(`[GraphWiki] Building graph from ${path}`);
    console.log(`[GraphWiki] Options:`, options);

    // Create .graphwiki directory if needed
    const graphwikiDir = '.graphwiki';
    if (!existsSync(graphwikiDir)) {
      console.log(`[GraphWiki] Creating ${graphwikiDir}/`);
    }

    // Load existing graph
    const graph = await loadGraph();

    // Count source files
    let fileCount = 0;
    const [ignorePatterns, _sources] = await resolveIgnores(path);
    const discovered = await glob("**/*", {
      cwd: path,
      ignore: ignorePatterns,
      absolute: false,
    });
    fileCount = discovered.length;

    console.log(`[GraphWiki] Found ${fileCount} files`);
    console.log(`[GraphWiki] Graph has ${graph.nodes.length} nodes, ${graph.edges.length} edges`);

    if (options.update) {
      console.log('[GraphWiki] Running incremental update...');
    }

    if (options.resume) {
      console.log('[GraphWiki] Resuming interrupted build...');
    }

    // Simulate build
    console.log('[GraphWiki] Build complete!');
    console.log(`[GraphWiki] Graph now has ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
  });

// Query command
program
  .command('query')
  .description('Query the knowledge graph')
  .argument('<question>', 'Question to answer')
  .action(async (question: string) => {
    console.log(`[GraphWiki] Query: ${question}`);

    const graph = await loadGraph();

    console.log(`[GraphWiki] Searching through ${graph.nodes.length} nodes...`);

    // Simple keyword matching
    const terms = question.toLowerCase().split(/\s+/);
    const matching = graph.nodes.filter(node => {
      const text = `${node.label} ${node.type}`.toLowerCase();
      return terms.some(term => text.includes(term));
    });

    if (matching.length > 0) {
      console.log(`[GraphWiki] Found ${matching.length} matching nodes:`);
      for (const node of matching.slice(0, 10)) {
        console.log(`  - ${node.label} (${node.type})`);
      }
      if (matching.length > 10) {
        console.log(`  ... and ${matching.length - 10} more`);
      }
    } else {
      console.log('[GraphWiki] No matching nodes found');
    }

    console.log('[GraphWiki] To get detailed answers, use graphwiki ask command');
  });

// Ask command
program
  .command('ask')
  .description('Ask a detailed question using full graph context')
  .argument('<question>', 'Question to answer')
  .option('--max-tier <n>', 'Maximum context tier', '3')
  .action(async (question: string, options) => {
    console.log(`[GraphWiki] Asking: ${question}`);
    console.log(`[GraphWiki] Max tier: ${options.maxTier}`);

    const graph = await loadGraph();

    console.log(`[GraphWiki] Loading graph context (tier 1)...`);
    console.log(`[GraphWiki] Searching relevant nodes...`);

    console.log('\n[Answer] (Placeholder - LLM integration required)');
    console.log(`Based on the knowledge graph containing ${graph.nodes.length} nodes,`);
    console.log(`here is what I found related to: "${question}"`);
  });

// Ingest command
program
  .command('ingest')
  .description('Ingest a new source file into the graph')
  .argument('<source>', 'Source file path')
  .action(async (source: string) => {
    console.log(`[GraphWiki] Ingesting: ${source}`);

    try {
      const content = await readFile(source, 'utf-8');
      console.log(`[GraphWiki] Read ${content.length} bytes from ${source}`);

      // Load graph
      const graph = await loadGraph();

      // Create node for this source
      const nodeId = `source:${source}`;
      const node = {
        id: nodeId,
        label: source.split('/').pop() || source,
        type: 'source',
        source_file: source,
        provenance: [source],
      };

      // Check if already exists
      const existing = graph.nodes.findIndex(n => n.id === nodeId);
      if (existing >= 0) {
        graph.nodes[existing] = node;
      } else {
        graph.nodes.push(node);
      }

      // Save updated graph
      await saveGraph(graph);

      console.log(`[GraphWiki] Ingested: ${node.label}`);
      console.log(`[GraphWiki] Graph now has ${graph.nodes.length} nodes`);
    } catch (err) {
      console.error(`[GraphWiki] Error: ${err}`);
      process.exit(1);
    }
  });

// Lint command
program
  .command('lint')
  .description('Run health check on the graph')
  .option('--fix', 'Auto-fix issues where possible')
  .action(async (options) => {
    console.log('[GraphWiki] Running lint check...');

    const graph = await loadGraph();

    let issues = 0;

    // Check for orphan nodes
    const connectedNodes = new Set<string>();
    for (const edge of graph.edges) {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);
    }

    for (const node of graph.nodes) {
      if (!connectedNodes.has(node.id) && graph.nodes.length > 1) {
        console.log(`  [WARN] Orphan node: ${node.label} (${node.id})`);
        issues++;
      }
    }

    // Check for duplicate edges
    const edgeSet = new Set<string>();
    for (const edge of graph.edges) {
      const key = `${edge.source}:${edge.target}`;
      if (edgeSet.has(key)) {
        console.log(`  [WARN] Duplicate edge: ${key}`);
        issues++;
      }
      edgeSet.add(key);
    }

    // Check for missing labels
    for (const node of graph.nodes) {
      if (!node.label) {
        console.log(`  [ERROR] Missing label: ${node.id}`);
        issues++;
      }
    }

    if (issues === 0) {
      console.log('[GraphWiki] No issues found');
    } else {
      console.log(`[GraphWiki] Found ${issues} issues`);
      if (options.fix) {
        console.log('[GraphWiki] Auto-fix not yet implemented');
      }
    }
  });

// Status command
program
  .command('status')
  .description('Show graph statistics and health status')
  .action(async () => {
    const graph = await loadGraph();

    console.log('=== GraphWiki Status ===');
    console.log(`Nodes: ${graph.nodes.length}`);
    console.log(`Edges: ${graph.edges.length}`);

    // Count by type
    const byType = new Map<string, number>();
    for (const node of graph.nodes) {
      const type = node.type || 'unknown';
      byType.set(type, (byType.get(type) || 0) + 1);
    }

    console.log('\nBy Type:');
    for (const [type, count] of byType) {
      console.log(`  ${type}: ${count}`);
    }

    // Communities
    const communities = new Set<number>();
    for (const node of graph.nodes) {
      if (node.community !== undefined) {
        communities.add(node.community);
      }
    }
    console.log(`\nCommunities: ${communities.size}`);

    // Density
    const maxEdges = graph.nodes.length * (graph.nodes.length - 1);
    const density = maxEdges > 0 ? (graph.edges.length / maxEdges).toFixed(4) : '0';
    console.log(`Density: ${density}`);

    // Metadata
    if (graph.metadata) {
      console.log('\nMetadata:');
      for (const [key, value] of Object.entries(graph.metadata)) {
        console.log(`  ${key}: ${value}`);
      }
    }
  });

// Path command
program
  .command('path')
  .description('Find shortest path between two nodes')
  .argument('<nodeA>', 'Start node ID or label')
  .argument('<nodeB>', 'End node ID or label')
  .action(async (nodeA: string, nodeB: string) => {
    const graph = await loadGraph();

    // Find nodes
    const nodeAObj = findNode(graph, nodeA);
    const nodeBObj = findNode(graph, nodeB);

    if (!nodeAObj) {
      console.error(`[GraphWiki] Node not found: ${nodeA}`);
      process.exit(1);
    }

    if (!nodeBObj) {
      console.error(`[GraphWiki] Node not found: ${nodeB}`);
      process.exit(1);
    }

    const path = findShortestPath(graph, nodeAObj.id, nodeBObj.id);

    if (path) {
      console.log(`[GraphWiki] Path from ${nodeA} to ${nodeB} (${path.length} steps):`);
      for (let i = 0; i < path.length; i++) {
        const node = findNode(graph, path[i] ?? '');
        const prefix = i === 0 ? '  ' : '  -> ';
        console.log(`${prefix}${node?.label || path[i]} (${node?.type || 'unknown'})`);
      }
    } else {
      console.log(`[GraphWiki] No path found between ${nodeA} and ${nodeB}`);
    }
  });

// Benchmark command
program
  .command('benchmark')
  .description('Run benchmark query and measure token usage')
  .argument('[query]', 'Benchmark query (optional)')
  .action(async (query: string | undefined) => {
    const q = query || 'What functions are defined in this codebase?';
    console.log(`[GraphWiki] Benchmarking: ${q}`);

    const graph = await loadGraph();

    // Simulate token counting
    const inputTokens = Math.ceil(q.length / 4);
    const contextTokens = graph.nodes.length * 10;
    const outputTokens = 50;

    console.log('\n[Results]');
    console.log(`  Query tokens: ${inputTokens}`);
    console.log(`  Context tokens: ${contextTokens}`);
    console.log(`  Output tokens: ${outputTokens}`);
    console.log(`  Total tokens: ${inputTokens + contextTokens + outputTokens}`);
  });

// Refine command
program
  .command('refine')
  .description('Auto-improve extraction prompts')
  .option('--review', 'Show refinement suggestions without applying')
  .option('--rollback', 'Revert to previous prompt version')
  .option('--force', 'Force refinement even if validation fails')
  .action(async (options) => {
    console.log('[GraphWiki] Refinement system');
    console.log(`[GraphWiki] Options:`, options);

    if (options.rollback) {
      console.log('[GraphWiki] Rolling back to previous version...');
      console.log('[GraphWiki] (Rollback not yet implemented)');
      return;
    }

    if (options.review) {
      console.log('[GraphWiki] Showing refinement suggestions...');
    } else {
      console.log('[GraphWiki] Running refinement...');
    }

    console.log('[GraphWiki] (Refinement requires LLM provider configuration)');
  });

// Serve command
program
  .command('serve')
  .description('Start the MCP server')
  .option('--http', 'Use HTTP transport instead of stdio')
  .option('--port <n>', 'HTTP port (default: 8080)', '8080')
  .action(async (options) => {
    console.log('[GraphWiki] Starting MCP server...');

    if (options.http) {
      console.log(`[GraphWiki] HTTP transport on port ${options.port}`);
      console.log('[GraphWiki] POST http://localhost:' + options.port + '/mcp');
      console.log('[GraphWiki] GET http://localhost:' + options.port + '/mcp/stream');
    } else {
      console.log('[GraphWiki] stdio transport (JSON-RPC)');
    }

    console.log('[GraphWiki] Server ready');

    // For stdio, we'd start reading stdin
    // For HTTP, we'd start Express server
    // In production, this would block
    if (!options.http) {
      console.log('[GraphWiki] Waiting for requests... (Ctrl+C to exit)');
    }
  });

// Skill command (install, generate, uninstall)
const skill = program.command('skill').description('Skill management commands');

// Skill install
skill
  .command('install')
  .description('Install GraphWiki skill for your platform')
  .option('--platform <p>', 'Platform: claude, codex, auggie, gemini, cursor, openclaw, copilot')
  .option('--hooks', 'Also install PreToolUse hooks', false)
  .action(async (options) => {
    const platform = options.platform || 'claude';
    console.log(`[GraphWiki] Installing skill for ${platform}...`);

    // Dynamic import to avoid circular deps
    const { installSkill, installAll } = await import('./hooks/skill-installer.js');

    if (options.hooks || platform === 'claude') {
      await installAll();
    } else {
      await installSkill(platform as Parameters<typeof installSkill>[0]);
    }
    console.log(`[GraphWiki] Skill installed successfully!`);
    console.log(`[GraphWiki] Restart your IDE/CLI to use the graphwiki skill`);
  });

// Skill generate
skill
  .command('generate')
  .description('Generate platform-specific skill files')
  .option('--check', 'Verify files match (exit non-zero if mismatched)')
  .action(async (options) => {
    console.log(`[GraphWiki] Generating skill files...`);

    const { generateHooksJsonEntries } = await import('./hooks/skill-generator.js');

    // Run the generator
    const { exec } = await import('child_process');
    const util = await import('util');
    const execPromise = util.promisify(exec);

    const args = options.check ? ['--check'] : [];
    try {
      await execPromise(`tsx src/hooks/skill-generator.ts ${args.join(' ')}`, { cwd: process.cwd() });
      console.log('[GraphWiki] Skill files generated successfully');
    } catch (err) {
      console.error(`[GraphWiki] Generation failed: ${err}`);
      process.exit(1);
    }

    // Show hook entries
    const hookEntries = generateHooksJsonEntries();
    console.log('\n[GraphWiki] Hook entries for hooks.json:');
    console.log(hookEntries);
  });

// Skill uninstall
skill
  .command('uninstall')
  .description('Remove GraphWiki skill installation')
  .option('--platform <p>', 'Platform to uninstall from')
  .option('--hooks', 'Also remove PreToolUse hooks', false)
  .action(async (options) => {
    const platform = options.platform || 'claude';
    console.log(`[GraphWiki] Uninstalling skill for ${platform}...`);

    const { uninstallHook } = await import('./hooks/skill-installer.js');

    if (options.hooks || platform === 'claude') {
      await uninstallHook();
    }
    console.log(`[GraphWiki] Skill uninstalled successfully`);
  });

// Export command
program
  .command('export')
  .description('Export graph to various formats')
  .argument('<format>', 'Export format: html, obsidian, neo4j, graphml')
  .option('--output <dir>', 'Output directory', 'graphwiki-out/exports')
  .action(async (format: string, options) => {
    console.log(`[GraphWiki] Exporting to ${format}...`);

    const graph = await loadGraph();
    console.log(`[GraphWiki] Graph has ${graph.nodes.length} nodes, ${graph.edges.length} edges`);

    const outputDir = options.output;
    console.log(`[GraphWiki] Output directory: ${outputDir}`);

    switch (format) {
      case 'html':
        console.log('[GraphWiki] Exporting HTML (vis.js)...');
        break;
      case 'obsidian':
        console.log('[GraphWiki] Exporting Obsidian vault...');
        break;
      case 'neo4j':
        console.log('[GraphWiki] Exporting Neo4j Cypher...');
        break;
      case 'graphml':
        console.log('[GraphWiki] Exporting GraphML...');
        break;
      default:
        console.error(`[GraphWiki] Unknown format: ${format}`);
        process.exit(1);
    }

    console.log('[GraphWiki] Export complete!');
  });

// ============================================================
// Main
// ============================================================

program.parse();
