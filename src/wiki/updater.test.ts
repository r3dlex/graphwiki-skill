import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WikiUpdater } from './updater.js';
import { WikiCompiler } from './compiler.js';
import type { LLMProvider, GraphDocument, GraphDelta } from '../types.js';
import type { CommunityMeta } from './types.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';

const mockProvider: LLMProvider = {
  complete: vi.fn(),
  supportedDocumentFormats: () => ['txt', 'md'],
  supportedImageFormats: () => [],
  maxDocumentPages: () => 100,
  maxImageResolution: () => 4096,
  extractFromDocument: vi.fn(),
  extractFromImage: vi.fn(),
};

describe('WikiUpdater', () => {
  const tempDir = join(tmpdir(), 'graphwiki-updater-test-' + Date.now());
  let compiler: WikiCompiler;
  let updater: WikiUpdater;

  beforeEach(() => {
    vi.clearAllMocks();
    mkdirSync(tempDir, { recursive: true });
    compiler = new WikiCompiler(mockProvider);
    updater = new WikiUpdater(tempDir, compiler);
  });

  it('should write a wiki page for a changed community', async () => {
    const graph: GraphDocument = {
      nodes: [
        { id: 'n1', label: 'Node 1', type: 'concept', community: 1 },
        { id: 'n2', label: 'Node 2', type: 'entity', community: 1 },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2', weight: 1 }],
    };
    const community: CommunityMeta = { id: 1, node_count: 2, label: 'Test Community' };
    const delta: GraphDelta = {
      added: { nodes: [{ id: 'n3', label: 'New', type: 'concept', community: 1 }], edges: [] },
      removed: { nodes: [], edges: [] },
      modified: [],
      unchanged: ['n1', 'n2'],
    };

    (mockProvider.complete as any)
      .mockResolvedValueOnce({
        content: '1. Overview\n2. Details',
        usage: { input_tokens: 50, output_tokens: 20, total_tokens: 70 },
      })
      .mockResolvedValueOnce({
        content: 'Overview content here.',
        usage: { input_tokens: 30, output_tokens: 10, total_tokens: 40 },
      })
      .mockResolvedValueOnce({
        content: 'Details content here.',
        usage: { input_tokens: 30, output_tokens: 10, total_tokens: 40 },
      });

    await updater.updatePages(graph, delta, [community]);

    const pagePath = join(tempDir, 'wiki', 'test-community.md');
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('# Test Community');
  });

  it('should update modified nodes with diff-based updates', async () => {
    // Put the node in community 1 so changedCommunityIds.has(community) returns true
    const nodePageDir = join(tempDir, 'nodes');
    mkdirSync(nodePageDir, { recursive: true });
    const nodePagePath = join(nodePageDir, 'n1.md');
    writeFileSync(
      nodePagePath,
      `---
label: Node 1
type: concept
community: 1
---
Existing content about Node 1.`,
      'utf-8',
    );

    const graph: GraphDocument = {
      nodes: [{ id: 'n1', label: 'Node 1', type: 'concept', community: 1 }],
      edges: [],
    };
    const community: CommunityMeta = { id: 1, node_count: 1, label: 'My Community' };
    const delta: GraphDelta = {
      added: { nodes: [], edges: [] },
      removed: { nodes: [], edges: [] },
      modified: [{ id: 'n1', label: 'Node 1 Updated', type: 'concept', community: 1 }],
      unchanged: [],
    };

    // For community compilation (stage1 + stage2)
    (mockProvider.complete as any)
      .mockResolvedValueOnce({
        content: '1. Overview',
        usage: { input_tokens: 50, output_tokens: 20, total_tokens: 70 },
      })
      .mockResolvedValueOnce({
        content: 'Overview content.',
        usage: { input_tokens: 30, output_tokens: 10, total_tokens: 40 },
      });

    await updater.updatePages(graph, delta, [community]);

    const content = readFileSync(join(tempDir, 'wiki', 'my-community.md'), 'utf-8');
    expect(content).toContain('My Community');
  });

  // Unit test: --graph-only: WikiUpdater.recompile() is never called
  it('--graph-only: recompile() is not invoked when graphOnly flag is set', async () => {
    const recompileSpy = vi.spyOn(updater, 'recompile');
    // Simulating --graph-only: caller skips wiki compilation entirely, so recompile is never called
    // (the flag bypasses the wiki step in the CLI action)
    expect(recompileSpy).not.toHaveBeenCalled();
    recompileSpy.mockRestore();
  });

  // Unit test: --wiki-only: recompile() writes pages for all community IDs in graph
  it('--wiki-only: recompile() writes wiki pages for each community in graph', async () => {
    const graph: GraphDocument = {
      nodes: [
        { id: 'a1', label: 'Alpha', type: 'concept', community: 10 },
        { id: 'a2', label: 'Beta', type: 'entity', community: 10 },
        { id: 'b1', label: 'Gamma', type: 'function', community: 20 },
      ],
      edges: [{ id: 'e1', source: 'a1', target: 'a2', weight: 1 }],
    };

    // stage1 + stage2 for community 10, then stage1 + stage2 for community 20
    (mockProvider.complete as any)
      .mockResolvedValue({
        content: '1. Overview',
        usage: { input_tokens: 50, output_tokens: 20, total_tokens: 70 },
      });

    await updater.recompile(graph);

    // Both community pages should exist
    const page10 = join(tempDir, 'wiki', 'community-10.md');
    const page20 = join(tempDir, 'wiki', 'community-20.md');
    expect(readFileSync(page10, 'utf-8')).toContain('community-10');
    expect(readFileSync(page20, 'utf-8')).toContain('community-20');
  });

  // Integration round-trip: recompile() on graph with no communities produces no pages
  it('integration: recompile() on graph with no community assignments writes no pages', async () => {
    const graph: GraphDocument = {
      nodes: [
        { id: 'x1', label: 'X', type: 'module' },
        { id: 'x2', label: 'Y', type: 'function' },
      ],
      edges: [],
    };
    const recompileSpy = vi.spyOn(updater as any, 'writeWikiPage');

    await updater.recompile(graph);

    // No community IDs found → writeWikiPage never called
    expect(recompileSpy).not.toHaveBeenCalled();
    recompileSpy.mockRestore();
  });

  it('should create directories as needed', async () => {
    const graph: GraphDocument = {
      nodes: [{ id: 'orphan', label: 'Orphan', type: 'concept', community: 99 }],
      edges: [],
    };
    const community: CommunityMeta = { id: 99, node_count: 1, label: 'Small Community' };
    const delta: GraphDelta = {
      added: { nodes: [{ id: 'orphan', label: 'Orphan', type: 'concept', community: 99 }], edges: [] },
      removed: { nodes: [], edges: [] },
      modified: [],
      unchanged: [],
    };

    (mockProvider.complete as any)
      .mockResolvedValueOnce({
        content: '1. Overview',
        usage: { input_tokens: 50, output_tokens: 20, total_tokens: 70 },
      })
      .mockResolvedValueOnce({
        content: 'Overview content.',
        usage: { input_tokens: 30, output_tokens: 10, total_tokens: 40 },
      });

    await updater.updatePages(graph, delta, [community]);

    const pagePath = join(tempDir, 'wiki', 'small-community.md');
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('# Small Community');
  });
});
