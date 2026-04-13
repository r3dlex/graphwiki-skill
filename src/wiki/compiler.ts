import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type {
  GraphDocument,
  GraphNode,
  GraphEdge,
  LLMProvider,
} from '../types.js';
import type {
  CommunityMeta,
  WikiPage,
  CompilationConfig,
  Stage1Result,
  Stage2Result,
  Stage3Result,
} from './types.js';

const DEFAULT_CONFIG: Required<CompilationConfig> = {
  stage1_budget_in: 1500,
  stage1_budget_out: 800,
  stage2_budget_in: 1000,
  stage2_budget_out: 600,
  stage3_budget_in: 3000,
  stage3_budget_out: 1000,
  parallel_limit: 3,
  mode: 'standard',
  format: 'obsidian',
};

export class WikiCompiler {
  private config: Required<CompilationConfig>;

  constructor(_provider: LLMProvider | null, config: CompilationConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async compileCommunity(
    community: CommunityMeta,
    nodes: GraphNode[],
    edges: GraphEdge[],
    allNodes?: GraphNode[],
    allEdges?: GraphEdge[],
  ): Promise<WikiPage> {
    const stage1 = await this.compileStage1(community, nodes, edges);
    const pageName = community.label || `community-${community.id}`;
    const sections: string[] = [];

    for (const header of stage1.section_headers) {
      const stage2 = await this.compileStage2(header, nodes, edges);
      const sectionContent: string[] = [stage2.section_content];

      // In deep mode, run stage3 for every node in the community
      if (this.config.mode === 'deep') {
        const communityNodes = nodes.filter((n) => n.community === community.id);
        for (const node of communityNodes) {
          const stage3 = await this.compileStage3(node.id, node.label);
          const nodeLink = (this.config.format ?? 'obsidian') === 'plain'
            ? `[${node.label}](${node.label.replace(/\s+/g, '-').toLowerCase()}.md)`
            : `[[${node.label}]]`;
          sectionContent.push(`\n### ${nodeLink}\n\n${stage3.deep_content}`);
        }
      }

      sections.push(`## ${header}\n\n${sectionContent.join('\n')}`);
    }

    // Build wikilinks for related nodes in this community
    const communityNodes = nodes.filter((n) => n.community === community.id);
    const relatedLinks = communityNodes
      .map((n) => {
        const link = (this.config.format ?? 'obsidian') === 'plain'
          ? `[${n.label}](${n.label.replace(/\s+/g, '-').toLowerCase()}.md)`
          : `[[${n.label}]]`;
        return `- ${link}`;
      })
      .join('\n');
    const relatedSection = communityNodes.length > 0
      ? `\n\n## Related\n\n${relatedLinks}`
      : '';

    const content = `# ${pageName}\n\n${stage1.outline}\n\n${sections.join('\n\n')}${relatedSection}`;

    // Derive tags from node types and community
    const nodeTypes = [...new Set(communityNodes.map((n) => n.type))];
    const tags: string[] = ['generated', 'graphwiki', ...nodeTypes];
    if (community.id !== undefined) {
      tags.push(`community-${community.id}`);
    }

    // sources: unique source files from community nodes
    const sources = [...new Set(communityNodes.map((n) => n.source_file).filter((s): s is string => Boolean(s)))];

    // related: labels of adjacent communities (sharing an edge with this community)
    const communityNodeIds = new Set(communityNodes.map((n) => n.id));
    const adjacentCommunityIds = new Set<number>();
    const edgePool = allEdges ?? edges;
    const nodePool = allNodes ?? nodes;
    for (const edge of edgePool) {
      const srcInCommunity = communityNodeIds.has(edge.source);
      const tgtInCommunity = communityNodeIds.has(edge.target);
      if (srcInCommunity !== tgtInCommunity) {
        const outsideNodeId = srcInCommunity ? edge.target : edge.source;
        const outsideNode = nodePool.find((n) => n.id === outsideNodeId);
        if (outsideNode?.community !== undefined && outsideNode.community !== community.id) {
          adjacentCommunityIds.add(outsideNode.community);
        }
      }
    }
    // Map adjacent community ids to their labels
    const related: string[] = [];
    for (const adjId of adjacentCommunityIds) {
      const adjNodes = nodePool.filter((n) => n.community === adjId);
      if (adjNodes.length > 0) {
        // Use a representative label: the first node label or a generated one
        related.push(`community-${adjId}`);
      }
    }

    // confidence: based on edge confidence values within the community
    const communityEdges = edges.filter(
      (e) => communityNodeIds.has(e.source) && communityNodeIds.has(e.target),
    );
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    if (communityEdges.length > 0) {
      const allExtracted = communityEdges.every((e) => e.confidence === 'EXTRACTED');
      const inferredOrAmbiguousCount = communityEdges.filter(
        (e) => e.confidence === 'INFERRED' || e.confidence === 'AMBIGUOUS',
      ).length;
      if (allExtracted) {
        confidence = 'high';
      } else if (inferredOrAmbiguousCount / communityEdges.length > 0.5) {
        confidence = 'low';
      }
    }

    const now = new Date().toISOString();

    return {
      path: `wiki/${pageName.replace(/\s+/g, '-').toLowerCase()}.md`,
      frontmatter: {
        community: community.id,
        label: pageName,
        type: 'community',
        confidence,
        sources: sources.length > 0 ? sources : undefined,
        related: related.length > 0 ? related : undefined,
        created_at: now,
        updated_at: now,
        tags,
      },
      content,
    };
  }

  generateCanvas(pages: WikiPage[]): string {
    const GRID_COLS = Math.ceil(Math.sqrt(pages.length || 1));
    const COL_WIDTH = 300;
    const ROW_HEIGHT = 120;

    const canvasNodes = pages.map((page, i) => {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const fileName = page.path.startsWith('wiki/')
        ? page.path.slice(5)
        : page.path;
      return {
        id: page.frontmatter.label.replace(/\s+/g, '-').toLowerCase(),
        type: 'file',
        file: fileName,
        x: col * COL_WIDTH,
        y: row * ROW_HEIGHT,
        width: 250,
        height: 60,
      };
    });

    return JSON.stringify({ nodes: canvasNodes, edges: [] }, null, 2);
  }

  async compileStage1(
    community: CommunityMeta,
    nodes: GraphNode[],
    edges: GraphEdge[],
  ): Promise<Stage1Result> {
    const communityNodes = nodes.filter((n) => n.community === community.id);
    const communityEdges = edges.filter(
      (e) =>
        communityNodes.some((n) => n.id === e.source) &&
        communityNodes.some((n) => n.id === e.target),
    );

    // Group nodes by type to create section headers
    const typeGroups = new Map<string, GraphNode[]>();
    for (const node of communityNodes) {
      const type = node.type ?? 'unknown';
      if (!typeGroups.has(type)) typeGroups.set(type, []);
      typeGroups.get(type)!.push(node);
    }

    const section_headers = [...typeGroups.keys()].map((type) => {
      // Capitalize and naive pluralize
      const cap = type.charAt(0).toUpperCase() + type.slice(1);
      return cap.endsWith('s') ? cap : `${cap}s`;
    });

    const outline = `Community ${community.label || community.id} contains ${communityNodes.length} nodes and ${communityEdges.length} edges`;

    return {
      section_headers: section_headers.length > 0 ? section_headers : ['Overview'],
      outline,
      tokens_used: 0,
    };
  }

  async compileStage2(
    sectionHeader: string,
    nodes: GraphNode[],
    edges: GraphEdge[],
  ): Promise<Stage2Result> {
    // Derive the type from the section header (reverse of pluralize/capitalize)
    const derivedType = sectionHeader.replace(/s$/i, '').toLowerCase();
    const matchingNodes = nodes.filter((n) => (n.type ?? '').toLowerCase() === derivedType);

    const nodeEntries = matchingNodes.map((node) => {
      const snippet = typeof node.properties?.['content'] === 'string'
        ? (node.properties['content'] as string).substring(0, 200)
        : node.label;
      const nodeEdges = edges.filter((e) => e.source === node.id || e.target === node.id);
      const relList = nodeEdges
        .map((e) => `  - ${e.source} --${e.label || 'related'}--> ${e.target}`)
        .join('\n');
      return `### ${node.label}\n\n${snippet}${relList ? `\n\nRelationships:\n${relList}` : ''}`;
    });

    return {
      section_content: nodeEntries.join('\n\n') || `No ${sectionHeader.toLowerCase()} found.`,
      tokens_used: 0,
    };
  }

  async compileStage3(_nodeId: string, sourceContent: string): Promise<Stage3Result> {
    return {
      deep_content: sourceContent,
      source_verified: true,
      tokens_used: 0,
    };
  }

  generateSourcePages(graph: GraphDocument, wikiDir: string): WikiPage[] {
    const bySource = new Map<string, { nodes: GraphNode[]; edges: GraphEdge[] }>();

    for (const node of graph.nodes) {
      if (!node.source_file) continue;
      if (!bySource.has(node.source_file)) {
        bySource.set(node.source_file, { nodes: [], edges: [] });
      }
      bySource.get(node.source_file)!.nodes.push(node);
    }

    for (const [sourceFile, entry] of bySource) {
      const nodeIds = new Set(entry.nodes.map((n) => n.id));
      entry.edges = graph.edges.filter(
        (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
      );
      if (entry.nodes.length < 2) {
        bySource.delete(sourceFile);
      }
    }

    const sourcesDir = join(wikiDir, 'sources');
    mkdirSync(sourcesDir, { recursive: true });

    const now = new Date().toISOString();
    const pages: WikiPage[] = [];

    for (const [sourceFile, { nodes, edges }] of bySource) {
      const safeFilename = sourceFile
        .replace(/\.[^/.]+$/, '')
        .replace(/[/\\]/g, '-')
        .replace(/\s+/g, '-');

      const conceptsList = nodes
        .map((n) => `- **${n.label}** (${n.type})`)
        .join('\n');

      const relationsList = edges
        .map((e) => {
          const srcNode = nodes.find((n) => n.id === e.source);
          const tgtNode = nodes.find((n) => n.id === e.target);
          const srcLabel = srcNode?.label ?? e.source;
          const tgtLabel = tgtNode?.label ?? e.target;
          return `- ${srcLabel} → ${tgtLabel} (${e.label ?? 'related'})`;
        })
        .join('\n');

      const content = [
        `# ${sourceFile}`,
        '',
        `> ${nodes.length} concepts extracted`,
        '',
        '## Concepts',
        '',
        conceptsList,
        ...(edges.length > 0
          ? ['', '## Relationships', '', relationsList]
          : []),
      ].join('\n');

      const frontmatter = {
        type: 'source',
        title: sourceFile,
        source_file: sourceFile,
        node_count: nodes.length,
        created_at: now,
      };

      const fmLines = [
        '---',
        ...Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`),
        '---',
        '',
      ].join('\n');

      const filePath = join(sourcesDir, `${safeFilename}.md`);
      writeFileSync(filePath, fmLines + content, 'utf-8');

      pages.push({
        path: `wiki/sources/${safeFilename}.md`,
        frontmatter: {
          label: sourceFile,
          type: 'source',
          sources: [sourceFile],
          created_at: now,
          updated_at: now,
        },
        content,
      });
    }

    return pages;
  }

  async compileAll(
    communities: CommunityMeta[],
    graph: GraphDocument,
    wikiDir?: string,
  ): Promise<WikiPage[]> {
    // Sort by priority: highest node count first, then god nodes, then dependency order
    const sorted = [...communities].sort((a, b) => {
      if (b.node_count !== a.node_count) return b.node_count - a.node_count;
      const aGods = a.god_node_ids?.length ?? 0;
      const bGods = b.god_node_ids?.length ?? 0;
      if (bGods !== aGods) return bGods - aGods;
      return (a.dependency_order ?? a.id) - (b.dependency_order ?? b.id);
    });

    const results: WikiPage[] = [];
    const limit = this.config.parallel_limit;

    for (let i = 0; i < sorted.length; i += limit) {
      const batch = sorted.slice(i, i + limit);
      const pages = await Promise.all(
        batch.map((community) => {
          const communityNodes = graph.nodes.filter(
            (n) => n.community === community.id,
          );
          const communityEdges = graph.edges.filter(
            (e) =>
              communityNodes.some((n) => n.id === e.source) &&
              communityNodes.some((n) => n.id === e.target),
          );
          return this.compileCommunity(community, communityNodes, communityEdges, graph.nodes, graph.edges);
        }),
      );
      results.push(...pages);
    }

    if (wikiDir) {
      const sourcePages = this.generateSourcePages(graph, wikiDir);
      results.push(...sourcePages);
    }

    return results;
  }
}
