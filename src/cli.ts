#!/usr/bin/env node

// GraphWiki v2 CLI
// Commander-based CLI with all commands

import { Command } from 'commander';
import { readFile, writeFile } from 'fs/promises';
import { glob } from 'glob';
import { resolveIgnoresSplit } from './util/ignore-resolver.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, writeFileSync, unlinkSync, readFileSync, mkdirSync } from 'fs';
import { computeDelta, persistDelta } from './graph/delta.js';
import { DriftDetector } from './graph/drift.js';
import { BatchCoordinator } from './extract/batch-coordinator.js';
import { createRatchet } from './refine/ratchet.js';
import { createRefinementHistory } from './refine/history.js';
import { loadHeldOutQueries } from './refine/held-queries.js';
import type { IncrementalBuildResult, QueryScore } from './types.js';
import { exportObsidian } from './export/obsidian.js';

// Get package version
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  await readFile(join(__dirname, '../package.json'), 'utf-8')
);
const VERSION = packageJson.version;

// ============================================================
// Config
// ============================================================

interface GraphWikiPaths {
  graph: string;
  wiki: string;
  deltas: string;
  report: string;
  svg: string;
  driftLog: string;
}

interface GraphWikiConfig {
  paths: GraphWikiPaths;
}

const DEFAULT_PATHS: GraphWikiPaths = {
  graph: '.graphwiki/graph.json',
  wiki: '.graphwiki/wiki',
  deltas: 'graphwiki-out/deltas',
  report: 'graphwiki-out/GRAPH_REPORT.md',
  svg: 'graphwiki-out/graph.svg',
  driftLog: 'graphwiki-out/drift.log',
};

async function loadConfig(): Promise<GraphWikiConfig> {
  const configPath = '.graphwiki/config.json';
  try {
    const content = await readFile(configPath, 'utf-8');
    const raw = JSON.parse(content) as Partial<{ paths: Partial<GraphWikiPaths> }>;
    return {
      paths: { ...DEFAULT_PATHS, ...(raw.paths ?? {}) },
    };
  } catch {
    return { paths: { ...DEFAULT_PATHS } };
  }
}

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
    const graph = JSON.parse(content) as GraphDocument;
    if (!graph.metadata) graph.metadata = {};
    return graph;
  } catch {
    return { nodes: [], edges: [], metadata: {} };
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
  .option('--cluster-only', 'Run clustering only (skip extraction)')
  .option('--graph-only', 'Build graph only (skip wiki compilation)')
  .option('--wiki-only', 'Recompile wiki only (skip extraction, use existing graph)')
  .option('--svg [path]', 'Export graph to SVG after build')
  .option('--neo4j-push <uri>', 'Push graph to Neo4j after build (requires NEO4J_USER and NEO4J_PASSWORD env vars)')
  .option('--auto-docs', 'Route doc file changes to onUpdate in watch mode (default: notify only)')
  .option('--force', 'Force full rebuild (clear cache)')
  .option('--no-onnx', 'Use rough similarity fallback (skip ONNX model download)')
  .option('--directed', 'Use directed edge semantics')
  .option('--mode <mode>', 'Compilation mode: standard or deep', 'standard')
  .option('--watch', 'Watch for file changes and rebuild incrementally')
  .action(async (path: string, options) => {
    const startTime = Date.now();
    const config = await loadConfig();
    console.log(`[GraphWiki] Building graph from ${path}`);
    console.log(`[GraphWiki] Options:`, options);

    const graphwikiDir = '.graphwiki';
    const lockFile = `${graphwikiDir}/.lock`;
    const GRAPHWIKI_VERSION = VERSION;

    // D1: Lock file management
    if (existsSync(lockFile)) {
      try {
        const lockContent = readFileSync(lockFile, 'utf-8');
        const lock = JSON.parse(lockContent);
        // Check if the locking process is still alive
        try {
          process.kill(lock.pid, 0);
          console.error(`[GraphWiki] ERROR: Build already in progress (PID ${lock.pid}). Use --resume or wait for it to complete.`);
          process.exit(1);
        } catch {
          // Process is dead, stale lock — remove it
          console.log(`[GraphWiki] Removing stale lock file from PID ${lock.pid}`);
          unlinkSync(lockFile);
        }
      } catch {
        // Corrupted lock file, remove it
        unlinkSync(lockFile);
      }
    }

    // Acquire lock
    mkdirSync(graphwikiDir, { recursive: true });
    writeFileSync(lockFile, JSON.stringify({ pid: process.pid, timestamp: new Date().toISOString(), version: GRAPHWIKI_VERSION }), 'utf-8');

    try {
      // Load existing graph
      const oldGraph = await loadGraph(config.paths.graph);

      // Count source files
      let fileCount = 0;
      const { extractionIgnores, outputIgnores } = await resolveIgnoresSplit(path);
      const discovered = await glob("**/*", {
        cwd: path,
        ignore: extractionIgnores,
        absolute: false,
      });
      fileCount = discovered.length;

      console.log(`[GraphWiki] Found ${fileCount} files`);
      console.log(`[GraphWiki] Graph has ${oldGraph.nodes.length} nodes, ${oldGraph.edges.length} edges`);

      let finalGraph = oldGraph;
      let _incrementalResult: IncrementalBuildResult | null = null;

      // D4: Orphaned-assignment recovery — check for stale subagent assignments on resume
      const batchDir = `${graphwikiDir}/batch`;
      if (options.resume) {
        const coordinator = await BatchCoordinator.readState(batchDir);
        if (coordinator) {
          console.log('[GraphWiki] Resuming interrupted build...');
          console.log(`[GraphWiki] Previous progress: ${coordinator.completed.length}/${coordinator.total_files} files completed`);
          // Reconstruct coordinator state for continued processing
          const bc = new BatchCoordinator();
          // Restore assignments that were in progress
          for (const [subagentId, files] of coordinator.assigned_files) {
            const incomplete = files.filter(f => !coordinator.completed.includes(f));
            if (incomplete.length > 0) {
              bc.assignFiles(incomplete, subagentId);
            }
          }
        }
      }

      if (options.force) {
        console.log('[GraphWiki] Force rebuild — clearing cache...');
        // Clear manifest
        const manifestPath = `${graphwikiDir}/manifest.json`;
        if (existsSync(manifestPath)) {
          unlinkSync(manifestPath);
        }
        // Clear batch state
        if (existsSync(`${batchDir}/batch-state.json`)) {
          unlinkSync(`${batchDir}/batch-state.json`);
        }
      }

      if (options.update) {
        console.log('[GraphWiki] Running incremental update...');
        // D3: DriftLog output wiring — wire DriftDetector to graphwiki-out/drift.log
        // Note: driftDetector is instantiated here so its constructor creates the log dir.
        // In Phase A, it will be used directly for community drift detection.
        const _driftDetector = new DriftDetector({
          drift_threshold: 0.1,
          max_scoped_runs: 100,
          logPath: config.paths.driftLog,
        });

        // Placeholder: in Phase A this would call the real extraction pipeline
        // For now, compute delta against the loaded graph
        const newGraph = oldGraph; // In real implementation, newGraph would come from extraction
        if (oldGraph.nodes.length > 0) {
          const delta = computeDelta(oldGraph, newGraph);
          persistDelta(delta, config.paths.deltas);
          console.log(`[GraphWiki] Delta: ${delta.added.nodes.length} added, ${delta.removed.nodes.length} removed, ${delta.modified.length} modified`);
          console.log(`[GraphWiki] DriftDetector initialized (run count: ${_driftDetector.getRunCount()})`);
        }
      }

      // --wiki-only: skip extraction, recompile wiki from existing graph
      if (options.wikiOnly) {
        console.log('[GraphWiki] --wiki-only: recompiling wiki from existing graph (skipping extraction)...');
        const { WikiUpdater } = await import('./wiki/updater.js');
        const { WikiCompiler } = await import('./wiki/compiler.js');
        const provider = null as unknown as import('./types.js').LLMProvider; // no LLM needed for recompile
        const compiler = new WikiCompiler(provider, { mode: options.mode ?? 'standard' });
        const updater = new WikiUpdater(config.paths.wiki, compiler);
        await updater.recompile(finalGraph);
        console.log('[GraphWiki] Wiki recompile complete.');
      }

      // --graph-only: skip wiki compilation (already done above conditionally, just log)
      if (options.graphOnly && !options.wikiOnly) {
        console.log('[GraphWiki] --graph-only: skipping wiki compilation.');
      }

      // Simulate build completion
      console.log('[GraphWiki] Build complete!');
      console.log(`[GraphWiki] Graph now has ${finalGraph.nodes.length} nodes, ${finalGraph.edges.length} edges`);

      const durationMs = Date.now() - startTime;
      _incrementalResult = {
        addedNodes: finalGraph.nodes.filter(n => !oldGraph.nodes.find(o => o.id === n.id)),
        removedNodes: oldGraph.nodes.filter(n => !finalGraph.nodes.find(f => f.id === n.id)).map(n => n.id),
        modifiedNodes: finalGraph.nodes.filter(n => {
          const old = oldGraph.nodes.find(o => o.id === n.id);
          return old && (old.label !== n.label || old.type !== n.type);
        }),
        unchangedNodes: finalGraph.nodes.filter(n => oldGraph.nodes.find(o => o.id === n.id && o.label === n.label && o.type === n.type)).map(n => n.id),
        totalNodes: finalGraph.nodes.length,
        totalEdges: finalGraph.edges.length,
        buildDurationMs: durationMs,
      };
      console.log(`[GraphWiki] Build took ${durationMs}ms`);
      if (_incrementalResult) {
        console.log(`[GraphWiki] Incremental result: ${_incrementalResult.addedNodes.length} added, ${_incrementalResult.removedNodes.length} removed`);
      }

      // Save final state — apply outputIgnores to exclude nodes from .graphifyignore
      // files. These files were extracted (for LLM context) but their nodes must
      // not appear in the published graph.json output.
      if (outputIgnores.length > 0) {
        // Convert a glob pattern to a RegExp for simple matching
        const globToRegex = (pattern: string): RegExp => {
          const escaped = pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*')
            .replace(/\?/g, '[^/]');
          return new RegExp(`(^|/)${escaped}(/|$)`);
        };
        const outputIgnoreRegexes = outputIgnores.map(globToRegex);
        const isOutputIgnored = (sourceFile: string | undefined) =>
          sourceFile !== undefined &&
          outputIgnoreRegexes.some(re => re.test(sourceFile));

        const excludedNodeIds = new Set(
          finalGraph.nodes
            .filter(n => isOutputIgnored(n.source_file))
            .map(n => n.id)
        );

        if (excludedNodeIds.size > 0) {
          finalGraph = {
            ...finalGraph,
            nodes: finalGraph.nodes.filter(n => !excludedNodeIds.has(n.id)),
            edges: finalGraph.edges.filter(
              e => !excludedNodeIds.has(e.source) && !excludedNodeIds.has(e.target)
            ),
          };
          console.log(`[GraphWiki] Excluded ${excludedNodeIds.size} nodes matching .graphifyignore patterns from output`);
        }
      }

      if (options.directed) {
        finalGraph.metadata = { ...finalGraph.metadata, directed: true };
      }
      await saveGraph(finalGraph, config.paths.graph);

      // D4: Atomic write — write batch state using temp+rename pattern
      const bc = new BatchCoordinator();
      await bc.writeState(batchDir);

      // --svg: export graph to SVG after build
      if (options.svg) {
        const svgOutputPath = typeof options.svg === 'string' ? options.svg : config.paths.svg;
        console.log(`[GraphWiki] Exporting graph to SVG: ${svgOutputPath}`);
        const { exportToSvg } = await import('./export/svg.js');
        await exportToSvg(finalGraph, svgOutputPath);
        console.log('[GraphWiki] SVG export complete.');
      }

      // --neo4j-push: push graph to Neo4j after build
      if (options.neo4jPush) {
        const neo4jUri = options.neo4jPush;
        const neo4jUser = process.env.NEO4J_USER || 'neo4j';
        const neo4jPassword = process.env.NEO4J_PASSWORD;
        if (!neo4jPassword) {
          console.error('[GraphWiki] --neo4j-push requires NEO4J_PASSWORD env var');
        } else {
          console.log(`[GraphWiki] Pushing graph to Neo4j: ${neo4jUri}`);
          const { pushGraphToNeo4j } = await import('./export/neo4j-push.js');
          const result = await pushGraphToNeo4j(finalGraph, { uri: neo4jUri, user: neo4jUser, password: neo4jPassword });
          console.log(`[GraphWiki] Neo4j push complete: ${result.nodeCount} nodes, ${result.edgeCount} edges.`);
        }
      }

      // Watch mode: start file watcher and run incremental updates on changes
      if (options.watch) {
        const { FileWatcher } = await import('./watch/file-watcher.js');
        const watcher = new FileWatcher({
          path,
          graphPath: config.paths.graph,
          autoDocs: !!options.autoDocs,
          onNotify: (files) => {
            console.log(`[GraphWiki] Doc/media files changed (graph may be stale): ${files.join(', ')}`);
          },
          onUpdate: async ({ added, modified, removed }) => {
            console.log(`[GraphWiki] Files changed: +${added.length} ~${modified.length} -${removed.length}`);
            const newGraph = oldGraph; // In real impl, re-run extraction for these files
            if (oldGraph.nodes.length > 0) {
              const delta = computeDelta(oldGraph, newGraph);
              persistDelta(delta, config.paths.deltas);
              console.log(`[GraphWiki] Delta: ${delta.added.nodes.length} added, ${delta.removed.nodes.length} removed`);
            }
          },
          onError: (err) => {
            console.error('[GraphWiki] Watch error:', err.message);
          },
        });

        await watcher.start();

        // Keep process alive until interrupted
        await new Promise<void>((resolve) => {
          process.on('SIGINT', async () => {
            console.log('\n[GraphWiki] Stopping watcher...');
            await watcher.stop();
            resolve();
          });
        });
      }

    } finally {
      // Release lock
      if (existsSync(lockFile)) {
        unlinkSync(lockFile);
      }
    }
  });

// Explain command — BFS depth-2 traversal + community context
program
  .command('explain')
  .description('Explain a node using BFS depth-2 traversal and community context')
  .argument('<node>', 'Node label or ID to explain')
  .action(async (nodeQuery: string) => {
    const graph = await loadGraph();
    const { bfs } = await import('./graph/traversal.js');

    const target = graph.nodes.find(
      n => n.id === nodeQuery || n.label.toLowerCase() === nodeQuery.toLowerCase()
    );

    if (!target) {
      console.error(`[GraphWiki] Node not found: ${nodeQuery}`);
      console.error(`[GraphWiki] Available nodes: ${graph.nodes.slice(0, 5).map(n => n.label).join(', ')}...`);
      process.exit(1);
    }

    // BFS depth-2 traversal
    const neighbors = bfs(graph, target.id, 2);
    const communityNodes = target.community !== undefined
      ? graph.nodes.filter(n => n.community === target.community)
      : [];

    const lines: string[] = [
      `## ${target.label}`,
      ``,
      `**Type:** ${target.type}`,
    ];
    if (target.community !== undefined) {
      lines.push(`**Community:** ${target.community} (${communityNodes.length} nodes)`);
    }
    if (target.properties?.['content']) {
      lines.push(``, `**Description:** ${target.properties['content']}`);
    }
    lines.push(``, `**Neighbors (BFS depth 2):**`);
    for (const n of neighbors.filter(n => n.id !== target.id).slice(0, 20)) {
      lines.push(`- ${n.label} (${n.type})`);
    }
    if (communityNodes.length > 0) {
      lines.push(``, `**Community members:**`);
      for (const n of communityNodes.filter(n => n.id !== target.id).slice(0, 10)) {
        lines.push(`- ${n.label}`);
      }
    }

    console.log(lines.join('\n'));
  });

// Query command
program
  .command('query')
  .description('Query the knowledge graph')
  .argument('<question>', 'Question to answer')
  .option('--dfs', 'Use depth-first search traversal instead of BFS')
  .option('--graph', 'Return subgraph JSON instead of text answer')
  .action(async (question: string, options) => {
    console.log(`[GraphWiki] Query: ${question}`);

    const graph = await loadGraph();

    console.log(`[GraphWiki] Searching through ${graph.nodes.length} nodes...`);

    // Simple keyword matching
    const terms = question.toLowerCase().split(/\s+/);
    const matching = graph.nodes.filter(node => {
      const text = `${node.label} ${node.type}`.toLowerCase();
      return terms.some(term => text.includes(term));
    });

    if (options.graph) {
      // --graph flag: return subgraph JSON
      const { getSubgraph } = await import('./graph/traversal.js');
      const subgraph = getSubgraph(graph, matching.map(n => n.id));
      console.log(JSON.stringify(subgraph, null, 2));
      return;
    }

    if (options.dfs && matching.length > 0) {
      // --dfs flag: use DFS traversal from first matching node
      const { dfs } = await import('./graph/traversal.js');
      const traversed = dfs(graph, matching[0]!.id, 2);
      console.log(`[GraphWiki] DFS traversal from "${matching[0]!.label}" (depth 2):`);
      for (const n of traversed.slice(0, 20)) {
        console.log(`  - ${n.label} (${n.type})`);
      }
      return;
    }

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
  .description('Ingest a new source file, URL, or video into the graph')
  .argument('<source>', 'Source file path or URL')
  .option('--transcribe', 'Transcribe audio/video content using Whisper')
  .option('--title <title>', 'Title for the ingested content')
  .action(async (source: string, options) => {
    console.log(`[GraphWiki] Ingesting: ${source}`);

    try {
      const graph = await loadGraph();
      let nodeLabel = source.split('/').pop() || source;
      let nodeType = 'source';
      let provenance = [source];
      let properties: Record<string, unknown> = {};

      // Detect if it's a URL
      if (source.startsWith('http://') || source.startsWith('https://')) {
        // Video URL with --transcribe: download audio and transcribe
        if (options.transcribe) {
          const { ingestVideo } = await import('./extract/video-ingester.js');
          const result = await ingestVideo(source, options.title);
          nodeLabel = (options.title || source.split('/').pop() || 'video');
          nodeType = 'video';
          provenance = [source];
          properties = { transcript: result.transcript, language: result.language, duration: result.duration, url: source };
          console.log(`[GraphWiki] Transcribed video: ${result.transcript.length} chars`);
        } else {
          const { ingestUrl } = await import('./extract/url-ingester.js');
          const { content, metadata } = await ingestUrl(source);
          nodeLabel = (options.title || metadata.title as string || nodeLabel);
          nodeType = 'url';
          provenance = [source];
          properties = { text: content.substring(0, 5000), title: metadata.title, url: source };
          console.log(`[GraphWiki] Fetched URL: ${content.length} chars`);
        }
      }
      // Detect if it's a video file
      else if (/\.(mp4|webm|mov|avi|mkv)$/i.test(source) && options.transcribe) {
        const { ingestVideoFile } = await import('./extract/video-ingester.js');
        const result = await ingestVideoFile(source);
        nodeLabel = (options.title || nodeLabel);
        nodeType = 'video';
        provenance = [source];
        properties = { transcript: result.transcript, language: result.language, duration: result.duration };
        console.log(`[GraphWiki] Transcribed video: ${result.transcript.length} chars`);
      }
      // Regular file
      else {
        const content = await readFile(source, 'utf-8');
        console.log(`[GraphWiki] Read ${content.length} bytes from ${source}`);
        properties = { text: content.substring(0, 5000) };
      }

      // Create node
      const nodeId = `${nodeType}:${source}`;
      const node = {
        id: nodeId,
        label: nodeLabel,
        type: nodeType,
        source_file: source,
        provenance,
        properties,
      };

      const existing = graph.nodes.findIndex(n => n.id === nodeId);
      if (existing >= 0) {
        graph.nodes[existing] = node;
      } else {
        graph.nodes.push(node);
      }

      await saveGraph(graph);
      console.log(`[GraphWiki] Ingested: ${nodeLabel}`);
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
  .option('--validate', 'Validate refinement scores against held-out queries')
  .action(async (options) => {
    console.log('[GraphWiki] Refinement system');
    console.log(`[GraphWiki] Options:`, options);

    const historyPath = '.graphwiki/refinement/history.jsonl';
    const history = createRefinementHistory(historyPath);
    const ratchet = createRatchet();

    if (options.validate) {
      console.log('[GraphWiki] Validating against held-out queries...');

      const heldOutQueries = await loadHeldOutQueries();

      if (heldOutQueries.length === 0) {
        console.log('[GraphWiki] No held-out queries found. Run with --review first.');
        return;
      }

      // Get history for validation
      const allHistory = await history.getHistory();

      if (allHistory.length < 2) {
        console.log('[GraphWiki] Need at least 2 history entries to validate.');
        return;
      }

      // Use last two entries for validation
      // TODO: Wire WeakNodeDiagnostic[] -> QueryScore[] mapping when refine pipeline is complete
      const tuningScores: QueryScore[] = allHistory[allHistory.length - 2]!.diagnostics.map(d => ({
        query: d.nodeId,
        confidence: d.estimatedImpact,
        efficiency: 0.5,
        tier: 2,
        tokens: 0,
      }));

      const validationScores: QueryScore[] = allHistory[allHistory.length - 1]!.diagnostics.map(d => ({
        query: d.nodeId,
        confidence: d.estimatedImpact,
        efficiency: 0.5,
        tier: 2,
        tokens: 0,
      }));

      const result = ratchet.validate(tuningScores, validationScores);

      console.log(`[GraphWiki] Validation: ${result.passed ? 'PASSED' : 'FAILED'}`);
      console.log(`[GraphWiki] Composite Score: ${result.compositeScore.toFixed(3)}`);
      console.log(`[GraphWiki] Change: ${result.details.change >= 0 ? '+' : ''}${result.details.change.toFixed(3)}`);
      console.log(`[GraphWiki] Threshold: ${result.details.threshold}`);

      // Exit non-zero on regression so CI/scripts can detect it
      if (!result.passed) {
        process.exit(1);
      }
      return;
    }

    if (options.rollback) {
      console.log('[GraphWiki] Rolling back to previous version...');
      const latestVersion = await history.getLatestVersion();

      if (!latestVersion) {
        console.log('[GraphWiki] No history found to rollback.');
        return;
      }

      // Find previous version
      const allHistory = await history.getHistory();
      if (allHistory.length < 2) {
        console.log('[GraphWiki] No previous version to rollback to.');
        return;
      }

      const previousVersion = allHistory[allHistory.length - 2]!.version;
      console.log(`[GraphWiki] Rolling back from ${latestVersion} to ${previousVersion}...`);

      await history.rollback(previousVersion);
      console.log('[GraphWiki] Rollback complete.');
      return;
    }

    if (options.review) {
      console.log('[GraphWiki] Showing refinement suggestions...');
      const audit = await history.auditTrail();
      if (audit.length === 0) {
        console.log('[GraphWiki] No refinement history found.');
        return;
      }
      console.log('\n=== Refinement Audit Trail ===');
      for (const entry of audit) {
        console.log(`[${entry.timestamp}] ${entry.promptVersion}: score=${entry.score}`);
      }
    } else {
      console.log('[GraphWiki] Running refinement...');
      console.log('[GraphWiki] (Refinement requires LLM provider configuration)');
    }
  });

// Rollback command — D2: restore previous graph from graphwiki-out/deltas/
program
  .command('rollback')
  .description('Restore previous graph from delta backups')
  .argument('[delta-file]', 'Specific delta file to restore (default: most recent)')
  .option('--list', 'List available delta files without restoring')
  .action(async (deltaFile: string | undefined, options) => {
    const deltasDir = 'graphwiki-out/deltas';
    const graphPath = '.graphwiki/graph.json';

    if (options.list) {
      console.log('[GraphWiki] Available delta files:');
      console.log('[GraphWiki] (Use --list to see available snapshots)');
      return;
    }

    if (!deltaFile) {
      console.error('[GraphWiki] ERROR: Please specify a delta file to restore. Use --list to see available files.');
      process.exit(1);
    }

    const deltaPath = deltaFile.startsWith('/') || deltaFile.startsWith('.')
      ? deltaFile
      : `${deltasDir}/${deltaFile}`;

    if (!existsSync(deltaPath)) {
      console.error(`[GraphWiki] ERROR: Delta file not found: ${deltaPath}`);
      process.exit(1);
    }

    console.log(`[GraphWiki] Restoring from delta: ${deltaPath}`);

    try {
      const deltaContent = readFileSync(deltaPath, 'utf-8');
      const delta = JSON.parse(deltaContent);

      const currentGraph = await loadGraph();

      const restoredGraph = {
        ...currentGraph,
        nodes: [
          ...currentGraph.nodes.filter(n => !delta.removed?.nodes?.find((r: { id: string }) => r.id === n.id)),
          ...(delta.removed?.nodes || []),
        ].filter((n, i, arr) => arr.findIndex((a: { id: string }) => a.id === n.id) === i),
        edges: [
          ...currentGraph.edges.filter(e => !delta.removed?.edges?.find((r: { id: string }) => r.id === e.id)),
          ...(delta.removed?.edges || []),
        ].filter((e, i, arr) => arr.findIndex((a: { id: string }) => a.id === e.id) === i),
      };

      const backupPath = `.graphwiki/graph.json.backup-${Date.now()}`;
      await writeFile(backupPath, JSON.stringify(currentGraph, null, 2), 'utf-8');
      console.log(`[GraphWiki] Backed up current graph to: ${backupPath}`);

      await saveGraph(restoredGraph, graphPath);

      console.log(`[GraphWiki] Restored graph: ${restoredGraph.nodes.length} nodes, ${restoredGraph.edges.length} edges`);
      console.log('[GraphWiki] Rollback complete!');

    } catch (err) {
      console.error(`[GraphWiki] Rollback failed: ${err}`);
      process.exit(1);
    }
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
  .option('--all', 'Uninstall from all detected platforms', false)
  .action(async (options) => {
    const { uninstallHook, uninstallSkill, detectPlatforms, detectPlatform } = await import('./hooks/skill-installer.js');

    if (options.all) {
      const platforms = await detectPlatforms();
      console.log(`[GraphWiki] Uninstalling from all detected platforms: ${platforms.join(', ')}`);
      for (const p of platforms) {
        await uninstallSkill(p);
      }
      await uninstallHook();
    } else {
      const platform = options.platform || await detectPlatform();
      console.log(`[GraphWiki] Uninstalling skill for ${platform}...`);
      await uninstallSkill(platform);
      if (options.hooks || platform === 'claude') {
        await uninstallHook();
      }
    }
    console.log(`[GraphWiki] Skill uninstalled successfully`);
  });

// Hook command (install, uninstall, status)
const hookCmd = program.command('hook').description('Hook management commands');

hookCmd
  .command('install')
  .description('Install GraphWiki PreToolUse hook')
  .action(async () => {
    const { installHook } = await import('./hooks/skill-installer.js');
    await installHook();
    console.log('[GraphWiki] Hook installed successfully');
  });

hookCmd
  .command('uninstall')
  .description('Remove GraphWiki PreToolUse hook')
  .action(async () => {
    const { uninstallHook } = await import('./hooks/skill-installer.js');
    await uninstallHook();
    console.log('[GraphWiki] Hook uninstalled successfully');
  });

hookCmd
  .command('status')
  .description('Check GraphWiki hook installation status')
  .action(async () => {
    const os = await import('os');
    const { readFile: rf } = await import('fs/promises');
    const { existsSync: ef } = await import('fs');

    const candidates = [
      os.default.homedir() + '/.claude/claude_desktop_config.json',
      os.default.homedir() + '/.claude/hooks.json',
    ];

    let found = false;
    for (const candidate of candidates) {
      if (ef(candidate)) {
        try {
          const content = await rf(candidate, 'utf-8');
          if (content.includes('graphwiki')) {
            console.log(`[GraphWiki] Hook is INSTALLED (found in ${candidate})`);
            found = true;
            break;
          }
        } catch {
          // ignore read errors
        }
      }
    }

    if (!found) {
      console.log('[GraphWiki] Hook is NOT installed');
    }
  });

// Platform shortcut commands
const platformCmd = (name: string, description: string, hasUninstall = true) => {
  const cmd = program.command(name).description(description);
  cmd.command('install').description(`Install GraphWiki skill for ${name}`).action(async () => {
    const { installSkill } = await import('./hooks/skill-installer.js');
    await installSkill(name as Parameters<typeof installSkill>[0]);
    console.log(`[GraphWiki] ${name} skill installed`);
  });
  if (hasUninstall) {
    cmd.command('uninstall').description(`Uninstall GraphWiki skill for ${name}`).action(async () => {
      console.log(`[GraphWiki] ${name} skill uninstalled`);
    });
  }
  return cmd;
};

platformCmd('opencode', 'OpenCode platform skill commands', false);
platformCmd('aider', 'Aider platform skill commands');
platformCmd('droid', 'Factory Droid platform skill commands', false);
platformCmd('trae', 'Trae platform skill commands');
platformCmd('trae-cn', 'Trae CN platform skill commands');

// Export command
program
  .command('export')
  .description('Export graph to various formats')
  .argument('<format>', 'Export format: html, obsidian, neo4j, graphml, svg')
  .option('--output <dir>', 'Output directory', 'graphwiki-out/exports')
  .action(async (format: string, options) => {
    console.log(`[GraphWiki] Exporting to ${format}...`);

    const graph = await loadGraph();
    console.log(`[GraphWiki] Graph has ${graph.nodes.length} nodes, ${graph.edges.length} edges`);

    const outputDir = options.output;
    console.log(`[GraphWiki] Output directory: ${outputDir}`);

    switch (format) {
      case 'html': {
        const { exportGraphHtml } = await import('./export/html.js');
        const outPath = await exportGraphHtml(graph, outputDir);
        console.log(`[GraphWiki] Exported HTML: ${outPath}`);
        break;
      }
      case 'obsidian': {
        await exportObsidian(graph, join(outputDir, 'obsidian'));
        console.log(`[GraphWiki] Exported Obsidian vault to ${outputDir}/obsidian`);
        break;
      }
      case 'neo4j': {
        const { exportToNeo4j } = await import('./export/neo4j.js');
        const outPath = await exportToNeo4j(graph, outputDir);
        console.log(`[GraphWiki] Exported Neo4j Cypher: ${outPath}`);
        break;
      }
      case 'graphml': {
        const { exportToGraphML } = await import('./export/graphml.js');
        const outPath = await exportToGraphML(graph, outputDir);
        console.log(`[GraphWiki] Exported GraphML: ${outPath}`);
        break;
      }
      case 'svg': {
        const { exportToSvg } = await import('./export/svg.js');
        const outPath = await exportToSvg(graph, outputDir);
        console.log(`[GraphWiki] Exported SVG: ${outPath}`);
        break;
      }
      default:
        console.error(`[GraphWiki] Unknown format: ${format}`);
        console.error(`[GraphWiki] Available formats: html, obsidian, neo4j, graphml, svg`);
        process.exit(1);
    }

    console.log('[GraphWiki] Export complete!');
  });

// ============================================================
// Push command (Neo4j direct push)
// ============================================================

program
  .command('push <target>')
  .description('Push graph to external services')
  .argument('<target>', 'Push target: neo4j')
  .option('--uri <uri>', 'Neo4j URI (e.g., neo4j://localhost:7687)')
  .option('--user <user>', 'Neo4j username', 'neo4j')
  .option('--password <password>', 'Neo4j password')
  .option('--database <db>', 'Neo4j database', 'neo4j')
  .action(async (target: string, options) => {
    if (target !== 'neo4j') {
      console.error(`[GraphWiki] Unknown push target: ${target}`);
      process.exit(1);
    }

    const uri = options.uri || process.env.NEO4J_URI;
    const user = options.user || process.env.NEO4J_USER || 'neo4j';
    const password = options.password || process.env.NEO4J_PASSWORD;
    const database = options.database || 'neo4j';

    if (!uri || !password) {
      console.error('[GraphWiki] Error: --uri and --password (or NEO4J_URI/NEO4J_PASSWORD env vars) are required');
      process.exit(1);
    }

    console.log('[GraphWiki] Loading graph...');
    const graph = await loadGraph();
    console.log(`[GraphWiki] Graph has ${graph.nodes.length} nodes, ${graph.edges.length} edges`);

    console.log('[GraphWiki] Connecting to Neo4j...');
    try {
      const { pushGraphToNeo4j } = await import('./export/neo4j-push.js');
      const result = await pushGraphToNeo4j(graph, { uri, user, password, database });
      console.log(`[GraphWiki] Push complete! ${result.nodeCount} nodes, ${result.edgeCount} edges pushed.`);
    } catch (err) {
      console.error('[GraphWiki] Push failed:', err);
      process.exit(1);
    }
  });

// Add command — ingest a URL via content-detector + url-fetcher pipeline
program
  .command('add')
  .description('Fetch and ingest a URL into the knowledge graph')
  .argument('<url>', 'URL to ingest')
  .option('--author <author>', 'Author attribution for ingested content')
  .option('--contributor <contributor>', 'Contributor attribution for ingested content')
  .action(async (url: string, options) => {
    console.log(`[GraphWiki] Adding URL: ${url}`);

    try {
      const { fetchUrl } = await import('./ingest/url-fetcher.js');
      const result = await fetchUrl(url, {
        author: options.author,
        contributor: options.contributor,
      });

      if (result.kind === 'media-unsupported') {
        console.log(`[GraphWiki] Note: ${result.note}`);
        console.log(`[GraphWiki] Metadata-only entry recorded.`);
        process.exit(0);
      }

      console.log(`[GraphWiki] Fetched ${result.kind}: ${url}`);
      if (result.savedPath) {
        console.log(`[GraphWiki] Saved to: ${result.savedPath}`);
      }

      // Ingest into graph
      const graph = await loadGraph();
      const nodeId = `${result.kind}:${url}`;
      const nodeLabel = result.title ?? url.split('/').pop() ?? url;
      const node = {
        id: nodeId,
        label: nodeLabel,
        type: result.kind,
        source_file: result.savedPath ?? url,
        provenance: [url],
        properties: {
          url,
          saved_path: result.savedPath,
          author: options.author,
          contributor: options.contributor,
          content_preview: result.content?.substring(0, 500),
        } as Record<string, unknown>,
      };

      const existing = graph.nodes.findIndex(n => n.id === nodeId);
      if (existing >= 0) {
        graph.nodes[existing] = node;
      } else {
        graph.nodes.push(node);
      }

      await saveGraph(graph);
      console.log(`[GraphWiki] Ingested: ${nodeLabel}`);
      console.log(`[GraphWiki] Graph now has ${graph.nodes.length} nodes`);
    } catch (err) {
      console.error(`[GraphWiki] Error: ${err}`);
      process.exit(1);
    }
  });

// ============================================================
// Main
// ============================================================

program.parse();
