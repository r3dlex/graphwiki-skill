#!/usr/bin/env node

// GraphWiki v2 CLI
// Commander-based CLI with all commands

import { Command } from 'commander';
import { readFile, writeFile, stat } from 'fs/promises';
import { glob } from 'glob';
import { resolveIgnoresSplit } from './util/ignore-resolver.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, writeFileSync, unlinkSync, readFileSync, mkdirSync, readdirSync, appendFileSync } from 'fs';
import { computeDelta, persistDelta } from './graph/delta.js';
import { DriftDetector } from './graph/drift.js';
import { BatchCoordinator } from './extract/batch-coordinator.js';
import { createRatchet } from './refine/ratchet.js';
import { createRefinementHistory } from './refine/history.js';
import { loadHeldOutQueries } from './refine/held-queries.js';
import type { IncrementalBuildResult, QueryScore } from './types.js';
import { exportObsidian } from './export/obsidian.js';
import { validateUrl } from './util/security.js';
import { ASTExtractor } from './extract/ast-extractor.js';
import { detectLanguage } from './detect/detector.js';

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
  raw: string;
  log?: string;
}

interface GraphWikiWiki {
  format: 'obsidian' | 'plain';
}

interface GraphWikiConfig {
  paths: GraphWikiPaths;
  wiki: GraphWikiWiki;
}

const DEFAULT_WIKI: GraphWikiWiki = {
  format: 'obsidian',
};

const DEFAULT_PATHS: GraphWikiPaths = {
  graph: 'graphwiki-out/graph.json',
  wiki: 'graphwiki-out/wiki',
  deltas: 'graphwiki-out/deltas',
  report: 'graphwiki-out/GRAPH_REPORT.md',
  svg: 'graphwiki-out/graph.svg',
  driftLog: 'graphwiki-out/drift.log',
  raw: 'raw',
};

async function loadConfig(): Promise<GraphWikiConfig> {
  const configPath = '.graphwiki/config.json';
  try {
    const content = await readFile(configPath, 'utf-8');
    const raw = JSON.parse(content) as Partial<{
      paths: Partial<GraphWikiPaths>;
      wiki: Partial<GraphWikiWiki>;
    }>;
    return {
      paths: { ...DEFAULT_PATHS, ...(raw.paths ?? {}) },
      wiki: { ...DEFAULT_WIKI, ...(raw.wiki ?? {}) },
    };
  } catch {
    return { paths: { ...DEFAULT_PATHS }, wiki: { ...DEFAULT_WIKI } };
  }
}

function appendLog(logPath: string, operation: string, detail: string): void {
  const dir = dirname(logPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const entry = `- ${new Date().toISOString()} [${operation}] ${detail}\n`;
  appendFileSync(logPath, entry, 'utf-8');
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

async function loadGraph(graphPath = 'graphwiki-out/graph.json'): Promise<GraphDocument> {
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
  mkdirSync(dirname(graphPath), { recursive: true });
  await writeFile(graphPath, JSON.stringify(graph, null, 2), 'utf-8');
}

function findNode(graph: GraphDocument, nodeId: string) {
  return graph.nodes.find(n => n.id === nodeId || n.label === nodeId);
}

function getNeighbors(graph: GraphDocument, nodeId: string): string[] {
  const directed = graph.metadata?.directed === true;
  const neighborIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.source === nodeId) neighborIds.add(edge.target);
    if (!directed && edge.target === nodeId) neighborIds.add(edge.source);
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
// Extraction Helper
// ============================================================

/**
 * Extract nodes and edges from source files using AST (tree-sitter).
 * Zero LLM dependency — works offline with no API keys.
 */
async function extractGraph(
  files: string[],
  basePath: string
): Promise<GraphDocument> {
  const LANG_NORMALIZE: Record<string, string> = {
    'C#': 'c-sharp',
    'C++': 'cpp',
  };
  const MAX_FILE_SIZE = 1024 * 1024; // 1MB
  const BATCH_SIZE = 50;

  const astExtractor = new ASTExtractor();
  const allNodes: GraphDocument['nodes'] = [];
  const allEdges: GraphDocument['edges'] = [];

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (file) => {
        const fullPath = join(basePath, file);
        // Skip files > 1MB (generated code, binaries)
        try {
          const { size } = await stat(fullPath);
          if (size > MAX_FILE_SIZE) return null;
        } catch { return null; }

        const lang = detectLanguage(file);
        if (!lang) return null;

        const normalizedLang = LANG_NORMALIZE[lang] ?? lang;
        const content = await readFile(fullPath, 'utf-8');
        const { nodes, edges } = await astExtractor.extract(content, normalizedLang, file);

        // Set source_file on every node (required by .graphifyignore filter and downstream consumers)
        for (const node of nodes) {
          (node as GraphDocument['nodes'][0]).source_file = file;
        }

        return { nodes, edges };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        allNodes.push(...(result.value.nodes as GraphDocument['nodes']));
        allEdges.push(...(result.value.edges as GraphDocument['edges']));
      }
    }

    if ((i + BATCH_SIZE) % 1000 === 0 || i + BATCH_SIZE >= files.length) {
      console.log(`[GraphWiki] Extracted ${Math.min(i + BATCH_SIZE, files.length)}/${files.length} files...`);
    }
  }

  // Markdown files: extract locally via frontmatter parser
  const { extractFromMarkdown } = await import('./extract/frontmatter-extractor.js');
  for (const file of files) {
    const ext = file.split('.').pop()?.toLowerCase();
    if (ext === 'md' || ext === 'mdx' || ext === 'markdown') {
      try {
        const fullPath = join(basePath, file);
        const content = await readFile(fullPath, 'utf-8');
        const { nodes, edges } = extractFromMarkdown(content, file);
        for (const node of nodes) {
          (node as GraphDocument['nodes'][0]).source_file = file;
        }
        allNodes.push(...(nodes as GraphDocument['nodes']));
        allEdges.push(...(edges as GraphDocument['edges']));
      } catch { /* skip unreadable */ }
    }
  }

  return {
    nodes: allNodes,
    edges: allEdges,
    metadata: { directed: false },
  };
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
  .option('--neo4j-verify', 'After pushing to Neo4j, verify node/edge counts match')
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

      // Auto-scaffold .graphwikiignore on first build
      const graphwikiignorePath = join(path, '.graphwikiignore');
      if (!existsSync(graphwikiignorePath)) {
        const ignoreLines: string[] = [
          '# GraphWiki ignore patterns (auto-generated)',
          '',
          '# Always excluded',
          'coverage/',
          '.git/',
          '.cache/',
          '*.log',
          '.DS_Store',
          '.env',
          '.env.*',
          'graphwiki-out/',
          'graphify-out/',
          '.graphwiki/',
        ];

        if (existsSync(join(path, 'package.json'))) {
          ignoreLines.push('');
          ignoreLines.push('# Node.js / TypeScript (detected)');
          ignoreLines.push('node_modules/');
          ignoreLines.push('dist/');
          ignoreLines.push('build/');
          ignoreLines.push('.next/');
          ignoreLines.push('*.lock');
        }

        if (existsSync(join(path, 'pyproject.toml')) || existsSync(join(path, 'requirements.txt'))) {
          ignoreLines.push('');
          ignoreLines.push('# Python (detected)');
          ignoreLines.push('__pycache__/');
          ignoreLines.push('*.pyc');
          ignoreLines.push('.venv/');
          ignoreLines.push('venv/');
        }

        if (existsSync(join(path, 'Cargo.toml'))) {
          ignoreLines.push('');
          ignoreLines.push('# Rust (detected)');
          ignoreLines.push('target/');
        }

        if (existsSync(join(path, 'mix.exs'))) {
          ignoreLines.push('');
          ignoreLines.push('# Elixir (detected)');
          ignoreLines.push('deps/');
          ignoreLines.push('_build/');
        }

        if (existsSync(join(path, 'go.mod'))) {
          ignoreLines.push('');
          ignoreLines.push('# Go (detected)');
          ignoreLines.push('vendor/');
        }

        writeFileSync(graphwikiignorePath, ignoreLines.join('\n') + '\n', 'utf-8');
        console.log('Created .graphwikiignore with default patterns');
      }

      // Count source files
      let fileCount = 0;
      const { extractionIgnores, outputIgnores } = await resolveIgnoresSplit(path);
      const discovered = await glob("**/*", {
        cwd: path,
        ignore: extractionIgnores,
        absolute: false,
      });

      // Also include raw/ input documents if present (configurable via config.paths.raw)
      const rawDir = join(path, config.paths.raw);
      if (existsSync(rawDir)) {
        const rawFiles = await glob("**/*", {
          cwd: rawDir,
          ignore: extractionIgnores,
          absolute: false,
        });
        // Prefix with raw dir so source_file paths are relative to project root
        const prefixedRaw = rawFiles.map(f => join(config.paths.raw, f));
        discovered.push(...prefixedRaw);
        if (rawFiles.length > 0) {
          console.log(`[GraphWiki] Found ${rawFiles.length} files in raw/`);
        }
      }

      fileCount = discovered.length;

      console.log(`[GraphWiki] Found ${fileCount} files`);
      console.log(`[GraphWiki] Graph has ${oldGraph.nodes.length} nodes, ${oldGraph.edges.length} edges`);

      let finalGraph = oldGraph;
      let _incrementalResult: IncrementalBuildResult | null = null;

      // AST extraction — runs for full builds and incremental updates
      // Skip when --wiki-only or --cluster-only (those reuse the existing graph)
      if (!options.wikiOnly && !options.clusterOnly) {
        console.log('[GraphWiki] Extracting graph from source files...');
        finalGraph = await extractGraph(discovered, path);
        console.log(`[GraphWiki] Extraction complete: ${finalGraph.nodes.length} nodes, ${finalGraph.edges.length} edges`);
      }

      // Generate extraction prompts for non-code, non-markdown files
      if (!options.wikiOnly && !options.clusterOnly) {
        const { generateExtractionPrompt } = await import('./extract/prompt-generator.js');
        const pendingDir = join(graphwikiDir, 'pending');
        const promptExts = new Set(['.pdf', '.docx', '.pptx', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
        let promptCount = 0;
        for (const file of discovered) {
          const ext = '.' + (file.split('.').pop()?.toLowerCase() ?? '');
          if (promptExts.has(ext)) {
            await generateExtractionPrompt(join(path, file), pendingDir);
            promptCount++;
          }
        }
        if (promptCount > 0) {
          console.log(`[GraphWiki] Generated ${promptCount} extraction prompts in ${pendingDir}/`);
        }
      }

      // --mode deep: generate extraction prompts for ALL discovered files
      if (options.mode === 'deep') {
        const { generateExtractionPrompt } = await import('./extract/prompt-generator.js');
        const deepDir = join(graphwikiDir, 'pending', 'deep');
        let deepCount = 0;
        for (const file of discovered) {
          await generateExtractionPrompt(join(path, file), deepDir);
          deepCount++;
        }
        console.log(`[GraphWiki] Deep mode: generated ${deepCount} prompts in ${deepDir}/`);
        console.log('[GraphWiki] Process prompts in .graphwiki/pending/deep/ to find non-obvious relationships');
      }

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

        // Load manifest for content-hash-based change detection
        const manifestPath = `${graphwikiDir}/manifest.json`;
        let manifest: Record<string, string> = {};
        if (existsSync(manifestPath)) {
          try {
            manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
          } catch { manifest = {}; }
        }

        // Use content hashing to detect both new and modified files
        const { createHash } = await import('crypto');
        const filesToExtract: string[] = [];
        const newManifest: Record<string, string> = { ...manifest };

        await Promise.all(discovered.map(async (file) => {
          try {
            const absPath = join(path, file);
            const content = await readFile(absPath, 'utf-8');
            const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
            if (manifest[file] !== hash) {
              filesToExtract.push(file);
              newManifest[file] = hash;
            }
          } catch { /* skip unreadable files */ }
        }));

        if (filesToExtract.length > 0) {
          const isNew = (f: string) => !manifest[f];
          const newCount = filesToExtract.filter(isNew).length;
          const modCount = filesToExtract.length - newCount;
          console.log(`[GraphWiki] Incremental: extracting ${newCount} new + ${modCount} modified files...`);
          const newGraph = await extractGraph(filesToExtract, path);
          // Remove stale nodes for modified files, then merge
          const modifiedSet = new Set(filesToExtract.filter(f => !isNew(f)));
          finalGraph = {
            ...finalGraph,
            nodes: [...finalGraph.nodes.filter(n => !modifiedSet.has(n.source_file ?? '')), ...newGraph.nodes],
            edges: [...finalGraph.edges.filter(e => {
              const src = finalGraph.nodes.find(n => n.id === e.source);
              return !modifiedSet.has(src?.source_file ?? '');
            }), ...newGraph.edges],
            metadata: finalGraph.metadata,
          };
        }

        if (finalGraph.nodes.length > 0) {
          const delta = computeDelta(oldGraph, finalGraph);
          persistDelta(delta, config.paths.deltas);
          console.log(`[GraphWiki] Delta: ${delta.added.nodes.length} added, ${delta.removed.nodes.length} removed, ${delta.modified.length} modified`);
          console.log(`[GraphWiki] DriftDetector initialized (run count: ${_driftDetector.getRunCount()})`);
        }

        // Update manifest after successful extraction
        mkdirSync(dirname(manifestPath), { recursive: true });
        await writeFile(manifestPath, JSON.stringify(newManifest, null, 2), 'utf-8');
      }

      // --wiki-only: skip extraction, recompile wiki from existing graph
      if (options.wikiOnly) {
        console.log('[GraphWiki] --wiki-only: recompiling wiki from existing graph (skipping extraction)...');
        const { WikiUpdater } = await import('./wiki/updater.js');
        const { WikiCompiler } = await import('./wiki/compiler.js');
        const provider = null;
        const compiler = new WikiCompiler(provider, {
          mode: options.mode ?? 'standard',
          format: config.wiki.format,
        });
        const updater = new WikiUpdater(config.paths.wiki, compiler);
        const pages = await compiler.compileAll(
          [...new Set(finalGraph.nodes.filter(n => n.community !== undefined).map(n => n.community as number))].map(id => ({
            id,
            node_count: finalGraph.nodes.filter(n => n.community === id).length,
            label: `community-${id}`,
          })),
          finalGraph,
        );
        await updater.recompile(finalGraph);
        console.log('[GraphWiki] Wiki recompile complete.');

        // Generate Obsidian canvas from compiled pages
        try {
          const canvasJson = compiler.generateCanvas(pages);
          const canvasPath = join(config.paths.wiki, 'graph.canvas');
          mkdirSync(dirname(canvasPath), { recursive: true });
          await writeFile(canvasPath, canvasJson, 'utf-8');
          console.log(`[GraphWiki] Canvas generated: ${canvasPath}`);
        } catch {
          // Canvas generation is non-fatal
        }
      }

      // --graph-only: skip wiki compilation (already done above conditionally, just log)
      if (options.graphOnly && !options.wikiOnly) {
        console.log('[GraphWiki] --graph-only: skipping wiki compilation.');
      }

      // Simulate build completion
      console.log('[GraphWiki] Build complete!');
      console.log(`[GraphWiki] Graph now has ${finalGraph.nodes.length} nodes, ${finalGraph.edges.length} edges`);
      {
        const logPath = config.paths.log ?? join(dirname(config.paths.graph), 'log.md');
        const communities = new Set(finalGraph.nodes.map(n => n.community).filter(c => c !== undefined)).size;
        appendLog(logPath, 'build', `${finalGraph.nodes.length} nodes, ${finalGraph.edges.length} edges, ${communities} communities`);
      }

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
      // Merge any completed agent extraction results
      const pendingDir2 = join(graphwikiDir, 'pending');
      if (existsSync(pendingDir2)) {
        const resultFiles = readdirSync(pendingDir2).filter((f: string) => f.endsWith('.result.json'));
        let mergedCount = 0;
        for (const rf of resultFiles) {
          try {
            const data = JSON.parse(readFileSync(join(pendingDir2, rf), 'utf-8')) as { nodes?: unknown[]; edges?: unknown[] };
            if (Array.isArray(data.nodes)) {
              for (const n of data.nodes as GraphDocument['nodes']) {
                if (!finalGraph.nodes.find((existing) => existing.id === n.id)) {
                  finalGraph.nodes.push(n);
                }
              }
            }
            if (Array.isArray(data.edges)) {
              for (const e of data.edges as GraphDocument['edges']) {
                if (!finalGraph.edges.find((existing) => existing.id === e.id)) {
                  finalGraph.edges.push(e);
                }
              }
            }
            mergedCount++;
          } catch { /* skip malformed */ }
        }
        if (mergedCount > 0) {
          console.log(`[GraphWiki] Merged ${mergedCount} agent extraction results`);
        }
      }

      await saveGraph(finalGraph, config.paths.graph);

      // CR-01+CR-02: Generate GRAPH_REPORT.md and print JSON summary after every build
      const { communities: buildCommunityCount } = generateGraphReport(finalGraph, config.paths.report);
      const pendingPromptsDir = join(graphwikiDir, 'pending');
      const pendingPrompts = existsSync(pendingPromptsDir)
        ? readdirSync(pendingPromptsDir).filter((f: string) => f.endsWith('.prompt.md')).length
        : 0;
      console.log(`[GraphWiki] Summary: ${JSON.stringify({
        nodes: finalGraph.nodes.length,
        edges: finalGraph.edges.length,
        communities: buildCommunityCount,
        pendingPrompts,
        reportPath: config.paths.report,
        tokens_used: 0,
      })}`);

      // Default build: compile wiki after graph is saved (skip if --graph-only or --wiki-only)
      if (!options.graphOnly && !options.wikiOnly) {
        console.log('[GraphWiki] Compiling wiki...');
        const { WikiUpdater } = await import('./wiki/updater.js');
        const { WikiCompiler } = await import('./wiki/compiler.js');
        const provider = null;
        const compiler = new WikiCompiler(provider, {
          mode: options.mode ?? 'standard',
          format: config.wiki.format,
        });
        const updater = new WikiUpdater(config.paths.wiki, compiler);
        const pages = await compiler.compileAll(
          [...new Set(finalGraph.nodes.filter(n => n.community !== undefined).map(n => n.community as number))].map(id => ({
            id,
            node_count: finalGraph.nodes.filter(n => n.community === id).length,
            label: `community-${id}`,
          })),
          finalGraph,
        );
        await updater.recompile(finalGraph);
        console.log('[GraphWiki] Wiki compilation complete.');

        // Generate Obsidian canvas if obsidian format
        if (config.wiki.format === 'obsidian') {
          try {
            const canvasJson = compiler.generateCanvas(pages);
            const canvasPath = join(config.paths.wiki, 'graph.canvas');
            mkdirSync(dirname(canvasPath), { recursive: true });
            await writeFile(canvasPath, canvasJson, 'utf-8');
            console.log('[GraphWiki] Obsidian canvas generated.');
          } catch {
            // Canvas generation is non-fatal
          }
        }
      }

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
          const { pushGraphToNeo4j, verifyNeo4jPush } = await import('./export/neo4j-push.js');
          const result = await pushGraphToNeo4j(finalGraph, { uri: neo4jUri, user: neo4jUser, password: neo4jPassword });
          console.log(`[GraphWiki] Neo4j push complete: ${result.nodeCount} nodes, ${result.edgeCount} edges.`);
          if (options.neo4jVerify) {
            await verifyNeo4jPush(finalGraph, { uri: neo4jUri, user: neo4jUser, password: neo4jPassword });
          }
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
            const changedFiles = [...added, ...modified];
            if (changedFiles.length > 0) {
              const currentGraph = await loadGraph(config.paths.graph);
              const newGraph = await extractGraph(changedFiles, path);
              const removedSet = new Set(removed);
              const mergedGraph: GraphDocument = {
                ...currentGraph,
                nodes: [...currentGraph.nodes.filter(n => !removedSet.has(n.source_file ?? '')), ...newGraph.nodes],
                edges: [...currentGraph.edges, ...newGraph.edges],
                metadata: currentGraph.metadata,
              };
              await saveGraph(mergedGraph, config.paths.graph);
              const computedDelta = computeDelta(currentGraph, mergedGraph);
              persistDelta(computedDelta, config.paths.deltas);
              console.log(`[GraphWiki] Delta: ${computedDelta.added.nodes.length} added, ${computedDelta.removed.nodes.length} removed`);
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
    const config = await loadConfig();
    const graph = await loadGraph(config.paths.graph);
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

    const config = await loadConfig();
    const graph = await loadGraph(config.paths.graph);

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
    {
      const logPath = config.paths.log ?? join(dirname(config.paths.graph), 'log.md');
      appendLog(logPath, 'query', `"${question}" → ${matching.length} nodes matched`);
    }
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

    const config = await loadConfig();
    const graph = await loadGraph(config.paths.graph);

    const keywords = question.toLowerCase().split(/\W+/).filter(w => w.length > 2);

    // Find relevant nodes by keyword matching on label and properties
    const relevantNodes = graph.nodes
      .map(node => {
        const text = `${node.label} ${node.type} ${String(node.properties?.['content'] ?? '')}`.toLowerCase();
        const score = keywords.filter(kw => text.includes(kw)).length;
        return { node, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(({ node }) => node);

    // Collect BFS neighbors (depth 2) from top matches
    const { bfs } = await import('./graph/traversal.js');
    const neighborSet = new Map<string, import('./types.js').GraphNode>();
    for (const node of relevantNodes.slice(0, 3)) {
      for (const n of bfs(graph, node.id, 2)) {
        neighborSet.set(n.id, n);
      }
    }

    // Collect relevant edges between found nodes
    const nodeIds = new Set([...relevantNodes.map(n => n.id), ...neighborSet.keys()]);
    const relevantEdges = graph.edges
      .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
      .slice(0, 20);

    // Check for wiki pages matching node labels
    const wikiDir = config.paths.wiki ?? 'wiki';
    const wikiRefs: string[] = [];
    if (existsSync(wikiDir)) {
      const { readdir } = await import('fs/promises');
      const wikiFiles = await readdir(wikiDir).catch(() => [] as string[]);
      for (const node of relevantNodes.slice(0, 5)) {
        const slug = node.label.toLowerCase().replace(/\W+/g, '-');
        const match = wikiFiles.find(f => f.includes(slug));
        if (match) wikiRefs.push(`${wikiDir}/${match}`);
      }
    }

    // Output structured context for the calling LLM to use
    const lines: string[] = [
      `[GraphWiki Context for: "${question}"]`,
      '',
      `## Relevant Nodes (${relevantNodes.length} found)`,
    ];
    for (const node of relevantNodes) {
      const desc = node.properties?.['content'] ? `: ${String(node.properties['content']).slice(0, 120)}` : '';
      lines.push(`- ${node.label} (${node.type})${desc}`);
    }
    if (relevantEdges.length > 0) {
      lines.push('', '## Graph Relationships');
      for (const edge of relevantEdges) {
        const src = graph.nodes.find(n => n.id === edge.source)?.label ?? edge.source;
        const tgt = graph.nodes.find(n => n.id === edge.target)?.label ?? edge.target;
        lines.push(`- ${src} → ${edge.label ?? 'relates_to'} → ${tgt}`);
      }
    }
    if (wikiRefs.length > 0) {
      lines.push('', '## Wiki References');
      for (const ref of wikiRefs) lines.push(`- ${ref}`);
    }
    lines.push('', `[End Context — use above to answer: "${question}"]`);

    console.log(lines.join('\n'));
    console.log('\n[GraphWiki] Context preparation complete. Use the above context to answer the question.');
    {
      const logPath = config.paths.log ?? join(dirname(config.paths.graph), 'log.md');
      appendLog(logPath, 'ask', `"${question}"`);
    }
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
      const config = await loadConfig();
      const graph = await loadGraph(config.paths.graph);
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

      await saveGraph(graph, config.paths.graph);
      console.log(`[GraphWiki] Ingested: ${nodeLabel}`);
      console.log(`[GraphWiki] Graph now has ${graph.nodes.length} nodes`);
      {
        const logPath = config.paths.log ?? join(dirname(config.paths.graph), 'log.md');
        appendLog(logPath, 'ingest', nodeLabel);
      }
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
  .option('--spec-drift', 'Check for exported functions not covered in spec files')
  .action(async (options) => {
    console.log('[GraphWiki] Running lint check...');

    const config = await loadConfig();
    const graph = await loadGraph(config.paths.graph);

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

    // --spec-drift: check exported functions have spec coverage
    if (options.specDrift) {
      const { execSync } = await import('child_process');
      const specFiles = existsSync('spec') ? await glob('spec/**/*.{ts,js,md}', {}) : [];
      const specContents = specFiles.map(f => {
        try { return readFileSync(f, 'utf-8'); } catch { return ''; }
      }).join('\n');

      const targetFiles = [
        'src/hooks/skill-installer.ts',
        'src/wiki/compiler.ts',
        'src/extract/llm-extractor.ts',
        'src/graph/traversal.ts',
        'src/util/ignore-resolver.ts',
      ];

      let driftCount = 0;
      for (const file of targetFiles) {
        if (!existsSync(file)) continue;
        let output = '';
        try {
          output = execSync(
            `grep -E "^export (async )?function|^export (const|class) " "${file}"`,
            { encoding: 'utf-8' }
          );
        } catch {
          continue;
        }
        for (const line of output.split('\n')) {
          const m = line.match(/export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/);
          if (!m) continue;
          const fnName = m[1]!;
          if (!specContents.includes(fnName)) {
            console.log(`[DRIFT] function '${fnName}' not found in any spec file`);
            driftCount++;
          }
        }
      }

      if (driftCount > 0) {
        if (!options.fix) {
          process.exit(1);
        }
      } else {
        console.log('[GraphWiki] No spec drift found');
      }
    }
  });

// Helper: generate and write GRAPH_REPORT.md — shared by build and status --report
function generateGraphReport(graph: GraphDocument, reportPath: string): { communities: number } {
  const byType = new Map<string, number>();
  for (const node of graph.nodes) {
    const type = node.type || 'unknown';
    byType.set(type, (byType.get(type) || 0) + 1);
  }

  const communities = new Set<number>();
  for (const node of graph.nodes) {
    if (node.community !== undefined) {
      communities.add(node.community);
    }
  }

  const maxEdges = graph.nodes.length * (graph.nodes.length - 1);
  const density = maxEdges > 0 ? (graph.edges.length / maxEdges).toFixed(4) : '0';

  const degree = new Map<string, number>();
  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  }
  const topNodes = [...degree.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, deg]) => ({ label: graph.nodes.find(n => n.id === id)?.label ?? id, deg }));

  const lines: string[] = [
    '# GraphWiki Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    `- Nodes: ${graph.nodes.length}`,
    `- Edges: ${graph.edges.length}`,
    `- Communities: ${communities.size}`,
    `- Density: ${density}`,
    '',
    '## Nodes by Type',
    '| Type | Count |',
    '|------|-------|',
  ];
  for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${type} | ${count} |`);
  }
  lines.push('', '## Top Connected Nodes (by degree)', '| Node | Edges |', '|------|-------|');
  for (const { label, deg } of topNodes) {
    lines.push(`| ${label} | ${deg} |`);
  }
  if (graph.metadata && Object.keys(graph.metadata).length > 0) {
    lines.push('', '## Metadata', '| Key | Value |', '|-----|-------|');
    for (const [key, value] of Object.entries(graph.metadata)) {
      lines.push(`| ${key} | ${value} |`);
    }
  }
  lines.push('');
  const reportContent = lines.join('\n');
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, reportContent, 'utf-8');
  console.log(`[GraphWiki] Report: ${reportPath}`);
  return { communities: communities.size };
}

// Status command
program
  .command('status')
  .description('Show graph statistics and health status')
  .option('--report', 'Write report to GRAPH_REPORT.md (config.paths.report)')
  .action(async (options) => {
    const config = await loadConfig();
    const graph = await loadGraph(config.paths.graph);

    if (options.report) {
      generateGraphReport(graph, config.paths.report);
    } else {
      const byType = new Map<string, number>();
      for (const node of graph.nodes) {
        const type = node.type || 'unknown';
        byType.set(type, (byType.get(type) || 0) + 1);
      }
      const communities = new Set<number>();
      for (const node of graph.nodes) {
        if (node.community !== undefined) communities.add(node.community);
      }
      const maxEdges = graph.nodes.length * (graph.nodes.length - 1);
      const density = maxEdges > 0 ? (graph.edges.length / maxEdges).toFixed(4) : '0';

      console.log('=== GraphWiki Status ===');
      console.log(`Nodes: ${graph.nodes.length}`);
      console.log(`Edges: ${graph.edges.length}`);

      console.log('\nBy Type:');
      for (const [type, count] of byType) {
        console.log(`  ${type}: ${count}`);
      }

      console.log(`\nCommunities: ${communities.size}`);
      console.log(`Density: ${density}`);

      if (graph.metadata) {
        console.log('\nMetadata:');
        for (const [key, value] of Object.entries(graph.metadata)) {
          console.log(`  ${key}: ${value}`);
        }
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
    const config = await loadConfig();
    const graph = await loadGraph(config.paths.graph);

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
  .option('--reset', 'Overwrite the saved baseline')
  .action(async (query: string | undefined, options) => {
    const graphPath = '.graphwiki/graph.json';
    if (!existsSync(graphPath)) {
      console.error('[GraphWiki] No graph found, build first');
      process.exit(1);
    }

    const graph = await loadGraph(graphPath);
    const q = query || 'What functions are defined in this codebase?';
    console.log(`[GraphWiki] Benchmarking: ${q}`);

    const { BaselineRunner } = await import('./benchmark/baseline-runner.js');
    const runner = await BaselineRunner.withTiktoken();
    const run = await runner.runGraphWiki(q, { files: [], size_bytes: 0, language: 'unknown' });

    const result = {
      timestamp: new Date().toISOString(),
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      totalTokens: run.tokens_consumed,
      method: 'graphwiki' as const,
    };

    console.log('\n[Results]');
    console.log(`  Nodes: ${result.nodeCount}`);
    console.log(`  Edges: ${result.edgeCount}`);
    console.log(`  Total tokens: ${result.totalTokens}`);
    console.log(`  Method: ${result.method}`);

    const benchmarkPath = '.graphwiki/benchmark.json';
    if (existsSync(benchmarkPath) && !options.reset) {
      try {
        const prev = JSON.parse(readFileSync(benchmarkPath, 'utf-8'));
        const prevTokens: number = prev.totalTokens ?? 0;
        if (prevTokens > 0) {
          const pctChange = ((result.totalTokens - prevTokens) / prevTokens) * 100;
          if (pctChange > 10) {
            console.warn(`[GraphWiki] REGRESSION: token usage increased by ${pctChange.toFixed(1)}% vs baseline`);
          }
        }
      } catch {
        // ignore corrupted baseline
      }
    }

    mkdirSync('.graphwiki', { recursive: true });
    writeFileSync(benchmarkPath, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`[GraphWiki] Benchmark saved to ${benchmarkPath}`);
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

      const config = await loadConfig();
      const currentGraph = await loadGraph(config.paths.graph);

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
      mkdirSync(dirname(backupPath), { recursive: true });
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
      const { uninstallSkill } = await import('./hooks/skill-installer.js');
      await uninstallSkill(name as Parameters<typeof uninstallSkill>[0]);
      console.log(`[GraphWiki] ${name} skill uninstalled`);
    });
  }
  return cmd;
};

platformCmd('opencode', 'OpenCode platform skill commands', true);
platformCmd('aider', 'Aider platform skill commands');
platformCmd('droid', 'Factory Droid platform skill commands', true);
platformCmd('trae', 'Trae platform skill commands');
platformCmd('trae-cn', 'Trae CN platform skill commands');
platformCmd('antigravity', 'Antigravity platform skill commands');
platformCmd('hermes', 'Hermes platform skill commands');

// Export command
program
  .command('export')
  .description('Export graph to various formats')
  .argument('<format>', 'Export format: html, obsidian, neo4j, graphml, svg')
  .option('--output <dir>', 'Output directory', 'graphwiki-out/exports')
  .action(async (format: string, options) => {
    console.log(`[GraphWiki] Exporting to ${format}...`);

    const config = await loadConfig();
    const graph = await loadGraph(config.paths.graph);
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
    const config = await loadConfig();
    const graph = await loadGraph(config.paths.graph);
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

    const validation = validateUrl(url);
    if (!validation.valid) {
      console.error(`[GraphWiki] URL rejected: ${validation.reason}`);
      return;
    }

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
      const config = await loadConfig();
      const graph = await loadGraph(config.paths.graph);
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

      await saveGraph(graph, config.paths.graph);
      console.log(`[GraphWiki] Ingested: ${nodeLabel}`);
      console.log(`[GraphWiki] Graph now has ${graph.nodes.length} nodes`);
      {
        const logPath = config.paths.log ?? join(dirname(config.paths.graph), 'log.md');
        appendLog(logPath, 'add', url);
      }
    } catch (err) {
      console.error(`[GraphWiki] Error: ${err}`);
      process.exit(1);
    }
  });

// Save-result command (memory feedback loop)
program
  .command('save-result')
  .description('Merge an LLM result JSON into the graph and archive the prompt file, or save a memory/wiki entry')
  .argument('[promptFile]', 'Path to the prompt file in .graphwiki/pending/')
  .argument('[resultFile]', 'Path to the result JSON file ({ nodes, edges })')
  .option('--question <text>', 'The question or query being answered')
  .option('--answer <text>', 'The answer or insight to record')
  .option('--type <type>', 'Memory type: insight | decision | discovery', 'insight')
  .option('--nodes <nodes...>', 'Referenced node IDs')
  .action(async (promptFile: string | undefined, resultFile: string | undefined, opts: {
    question?: string;
    answer?: string;
    type?: string;
    nodes?: string[];
  }) => {
    if (opts.question !== undefined) {
      // Memory loop mode: write memory file + wiki query page
      const question = opts.question;
      const answer = opts.answer ?? '';
      const memoryType = opts.type ?? 'insight';
      const nodes = opts.nodes ?? [];
      const timestamp = new Date().toISOString();

      // Build slug from question: lowercase, spaces→hyphens, strip non-alphanumeric (except hyphens), truncate to 40
      const slug = question
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 40)
        .replace(/-+$/, '');

      const nodesYaml = nodes.length > 0
        ? `[${nodes.map(n => n).join(', ')}]`
        : '[]';
      const nodesSection = nodes.length > 0
        ? `\n## Referenced Nodes\n${nodes.map(n => `- ${n}`).join('\n')}\n`
        : '';

      const frontmatter = `---\ntype: memory\nquestion: "${question}"\nanswer: "${answer.replace(/"/g, '\\"')}"\nmemory_type: ${memoryType}\nnodes: ${nodesYaml}\ncreated_at: ${timestamp}\n---\n`;
      const body = `# ${question}\n${answer}${nodesSection}`;
      const content = frontmatter + body;

      const filename = `${timestamp.replace(/[:.]/g, '-').replace('T', 'T').slice(0, 23)}-${slug}.md`;

      const memoryDir = 'graphwiki-out/memory';
      const wikiDir = 'graphwiki-out/wiki/queries';
      mkdirSync(memoryDir, { recursive: true });
      mkdirSync(wikiDir, { recursive: true });

      const memoryPath = join(memoryDir, filename);
      const wikiPath = join(wikiDir, `${slug}.md`);

      writeFileSync(memoryPath, content, 'utf-8');
      writeFileSync(wikiPath, content, 'utf-8');

      console.log(`Saved memory: ${memoryPath}`);
      {
        const logPath = join('graphwiki-out', 'log.md');
        appendLog(logPath, 'save-result', `"${question}"`);
      }
      return;
    }

    // Original positional form: merge result JSON into graph
    if (!promptFile || !resultFile) {
      console.error('[GraphWiki] Usage: save-result <promptFile> <resultFile>  OR  save-result --question "..." --answer "..."');
      process.exit(1);
    }

    const config = await loadConfig();

    // Read result file
    let result: { nodes: GraphDocument['nodes']; edges: GraphDocument['edges'] };
    try {
      const raw = await readFile(resultFile, 'utf-8');
      result = JSON.parse(raw) as typeof result;
    } catch {
      console.error(`[GraphWiki] Failed to read result file: ${resultFile}`);
      process.exit(1);
    }

    const newNodes = result.nodes ?? [];
    const newEdges = result.edges ?? [];

    // Load existing graph
    const graph = await loadGraph(config.paths.graph);

    // Merge nodes (dedup by id)
    const nodeIndex = new Map(graph.nodes.map(n => [n.id, n]));
    for (const node of newNodes) {
      if (!nodeIndex.has(node.id)) {
        nodeIndex.set(node.id, node);
      }
    }
    graph.nodes = [...nodeIndex.values()];

    // Merge edges (dedup by source+target)
    const edgeKey = (e: GraphDocument['edges'][0]) => `${e.source}:${e.target}`;
    const edgeIndex = new Map(graph.edges.map(e => [edgeKey(e), e]));
    for (const edge of newEdges) {
      if (!edgeIndex.has(edgeKey(edge))) {
        edgeIndex.set(edgeKey(edge), edge);
      }
    }
    graph.edges = [...edgeIndex.values()];

    // Save updated graph
    await saveGraph(graph, config.paths.graph);

    // Move prompt file to processed directory
    const processedDir = '.graphwiki/processed';
    mkdirSync(processedDir, { recursive: true });
    const promptFileName = promptFile.split('/').pop() ?? promptFile;
    const processedPath = join(processedDir, promptFileName);
    try {
      const promptContent = readFileSync(promptFile, 'utf-8');
      writeFileSync(processedPath, promptContent, 'utf-8');
      unlinkSync(promptFile);
    } catch {
      // Prompt file may not exist; not fatal
    }

    console.log(`Saved ${newNodes.length} nodes, ${newEdges.length} edges from result. Graph updated.`);
    {
      const logPath = join('graphwiki-out', 'log.md');
      appendLog(logPath, 'save-result', `${newNodes.length} nodes, ${newEdges.length} edges merged`);
    }
  });

// ============================================================
// Main
// ============================================================

program.parse();
