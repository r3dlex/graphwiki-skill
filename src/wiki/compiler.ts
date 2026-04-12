import type {
  GraphDocument,
  GraphNode,
  GraphEdge,
  LLMProvider,
  Message,
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
};

export class WikiCompiler {
  private provider: LLMProvider;
  private config: Required<CompilationConfig>;

  constructor(provider: LLMProvider, config: CompilationConfig = {}) {
    this.provider = provider;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async compileCommunity(
    community: CommunityMeta,
    nodes: GraphNode[],
    edges: GraphEdge[],
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
          sectionContent.push(`\n### [[${node.label}]]\n\n${stage3.deep_content}`);
        }
      }

      sections.push(`## ${header}\n\n${sectionContent.join('\n')}`);
    }

    // Build wikilinks for related nodes in this community
    const communityNodes = nodes.filter((n) => n.community === community.id);
    const relatedLinks = communityNodes
      .map((n) => `- [[${n.label}]]`)
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

    return {
      path: `wiki/${pageName.replace(/\s+/g, '-').toLowerCase()}.md`,
      frontmatter: {
        community: community.id,
        label: pageName,
        type: 'community',
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
    const communityNodes = nodes.filter(
      (n) => n.community === community.id,
    );
    const communityEdges = edges.filter(
      (e) =>
        communityNodes.some((n) => n.id === e.source) &&
        communityNodes.some((n) => n.id === e.target),
    );

    const nodeList = communityNodes
      .map((n) => `- ${n.label} (${n.type})`)
      .join('\n');
    const edgeList = communityEdges
      .map((e) => `- ${e.source} --${e.label || 'related'}--> ${e.target}`)
      .join('\n');

    const systemPrompt =
      'You are a technical writer creating a wiki outline. Generate a structured outline with section headers for a wiki page.';
    const userPrompt = `Create a wiki page outline for community "${community.label || `Community ${community.id}`}" with ${communityNodes.length} nodes and ${communityEdges.length} edges.

Nodes:
${nodeList}

Edges:
${edgeList}

Generate a structured outline with 3-6 section headers and a brief overview paragraph. Format sections as a numbered list.`;

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const result = await this.provider.complete(messages, {
      max_tokens: this.config.stage1_budget_out,
    });

    const lines = result.content.trim().split('\n');
    const section_headers: string[] = [];
    let outline = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^\d+[.)]?\s+.+/.test(trimmed)) {
        section_headers.push(trimmed.replace(/^\d+[.)]?\s+/, '').trim());
      } else if (outline === '' && trimmed) {
        outline = trimmed;
      }
    }

    return {
      section_headers,
      outline: outline || `Overview of ${community.label || `Community ${community.id}`}`,
      tokens_used: (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0),
    };
  }

  async compileStage2(
    sectionHeader: string,
    _nodes: GraphNode[],
    _edges: GraphEdge[],
  ): Promise<Stage2Result> {
    const systemPrompt =
      'You are a technical writer expanding wiki sections. Write comprehensive content for the requested section.';
    const userPrompt = `Write detailed content for the section "${sectionHeader}" in a wiki page.

Provide 2-3 paragraphs of substantive content that would belong in a technical wiki about this topic. Include relevant details from the graph structure if applicable.`;

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const result = await this.provider.complete(messages, {
      max_tokens: this.config.stage2_budget_out,
    });

    return {
      section_content: result.content.trim(),
      tokens_used: (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0),
    };
  }

  async compileStage3(nodeId: string, sourceContent: string): Promise<Stage3Result> {
    const systemPrompt =
      'You are a technical writer performing deep verification. Analyze the source content and verify its accuracy.';
    const userPrompt = `Perform a deep dive on node "${nodeId}" using this source content:

${sourceContent}

Verify the content is accurate and provide any additional insights or corrections. Return your findings.`;

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const result = await this.provider.complete(messages, {
      max_tokens: this.config.stage3_budget_out,
    });

    return {
      deep_content: result.content.trim(),
      source_verified: !result.content.toLowerCase().includes('incorrect'),
      tokens_used: (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0),
    };
  }

  async compileAll(
    communities: CommunityMeta[],
    graph: GraphDocument,
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
          return this.compileCommunity(community, communityNodes, communityEdges);
        }),
      );
      results.push(...pages);
    }

    return results;
  }
}
