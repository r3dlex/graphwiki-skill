import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WikiUpdater } from './updater.js';
import { WikiCompiler } from './compiler.js';
import type { LLMProvider, GraphDocument, GraphDelta } from '../types.js';
import type { CommunityMeta } from './types.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';

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

    mockProvider.complete
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
    mockProvider.complete
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

    mockProvider.complete
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
