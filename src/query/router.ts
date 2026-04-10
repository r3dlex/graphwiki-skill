import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { GraphDocument, GraphNode, GraphEdge, LLMProvider, Message } from '../types.js';
import type { QueryConfig, QueryResult } from './types.js';
import { WikiGraphMap } from '../wiki/wiki-graph-map.js';

const DEFAULT_QUERY_CONFIG: Required<QueryConfig> = {
  tier0_budget: 0,
  tier1_budget: 2000,
  tier2_budget: 500,
  tier3_budget: 5000,
  tier4_budget: 10000,
};

interface TierResult {
  answer: string;
  tier: number;
  tokens: number;
  pages_loaded: string[];
  nodes_traversed: string[];
}

export class QueryRouter {
  private graph: GraphDocument;
  private wikiDir: string;
  private provider: LLMProvider;
  private config: Required<QueryConfig>;
  private graphMap: WikiGraphMap;

  constructor(
    graph: GraphDocument,
    wikiDir: string,
    provider: LLMProvider,
    config: QueryConfig = {},
  ) {
    this.graph = graph;
    this.wikiDir = wikiDir;
    this.provider = provider;
    this.config = { ...DEFAULT_QUERY_CONFIG, ...config };
    this.graphMap = new WikiGraphMap(join(wikiDir, '.wiki-graph-map.json'));
  }

  async ask(question: string, budget: number = 4000): Promise<QueryResult> {
    // Tier 0: Graph traversal (local computation, no LLM)
    const tier0Result = this.tier0Traversal(question);
    if (tier0Result.answer) {
      return {
        answer: tier0Result.answer,
        tier_reached: 0,
        tokens_consumed: 0,
        pages_loaded: [],
        nodes_traversed: tier0Result.nodes_traversed,
      };
    }

    // Tier 1: Load GRAPH_REPORT.md
    const tier1Result = await this.tier1LoadReport(question);
    if (tier1Result.tokens <= this.config.tier1_budget) {
      return {
        answer: tier1Result.answer,
        tier_reached: 1,
        tokens_consumed: tier1Result.tokens,
        pages_loaded: [],
        nodes_traversed: [],
      };
    }

    // Tier 2: Community summaries
    const tier2Result = await this.tier2CommunitySummaries(question);
    if (tier2Result.tokens <= this.config.tier2_budget) {
      return {
        answer: tier2Result.answer,
        tier_reached: 2,
        tokens_consumed: tier2Result.tokens,
        pages_loaded: tier2Result.pages_loaded,
        nodes_traversed: [],
      };
    }

    // Tier 3: Wiki pages
    const tier3Result = await this.tier3WikiPages(question);
    if (tier3Result.tokens <= Math.min(this.config.tier3_budget, budget)) {
      return {
        answer: tier3Result.answer,
        tier_reached: 3,
        tokens_consumed: tier3Result.tokens,
        pages_loaded: tier3Result.pages_loaded,
        nodes_traversed: [],
      };
    }

    // Tier 4: Raw sources (last resort)
    return this.tier4RawSources(question);
  }

  private tier0Traversal(
    question: string,
  ): { answer: string | null; nodes_traversed: string[] } {
    const q = question.toLowerCase();
    const traversed: string[] = [];

    // Check for direct node matches
    for (const node of this.graph.nodes) {
      const labelLower = node.label.toLowerCase();
      if (q.includes(labelLower) || labelLower.includes(q.split(' ')[0] || '')) {
        traversed.push(node.id);
      }
    }

    // Answer simple structural questions
    if (q.includes('how many node') || q.includes('node count')) {
      return {
        answer: `The graph contains ${this.graph.nodes.length} nodes.`,
        nodes_traversed: traversed,
      };
    }
    if (q.includes('how many edge') || q.includes('edge count')) {
      return {
        answer: `The graph contains ${this.graph.edges.length} edges.`,
        nodes_traversed: traversed,
      };
    }
    if (q.includes('what is') && q.includes('node')) {
      if (traversed.length > 0) {
        const node = this.graph.nodes.find((n) => n.id === traversed[0])!;
        return {
          answer: `The node "${node.label}" is a ${node.type}.${node.community !== undefined ? ` It belongs to community ${node.community}.` : ''}`,
          nodes_traversed: traversed,
        };
      }
    }

    return { answer: null, nodes_traversed: traversed };
  }

  private async tier1LoadReport(question: string): Promise<TierResult> {
    const reportPath = join(this.wikiDir, '..', 'graphwiki-out', 'GRAPH_REPORT.md');

    if (!existsSync(reportPath)) {
      return { answer: 'Graph report not found. Please run the reporter first.', tier: 1, tokens: 0, pages_loaded: [] };
    }

    try {
      const reportContent = readFileSync(reportPath, 'utf-8');
      const tokens = reportContent.length / 4; // rough estimate

      const systemPrompt = 'You are a helpful assistant answering questions about a knowledge graph. Use the provided report to answer.';
      const userPrompt = `Based on this graph report, answer the question: "${question}"\n\nReport:\n${reportContent}`;

      const result = await this.provider.complete(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        { max_tokens: 500 },
      );

      return {
        answer: result.content.trim(),
        tier: 1,
        tokens: tokens + (result.usage?.total_tokens ?? 0),
        pages_loaded: [reportPath],
      };
    } catch {
      return { answer: 'Failed to load graph report.', tier: 1, tokens: 0, pages_loaded: [] };
    }
  }

  private async tier2CommunitySummaries(question: string): Promise<TierResult> {
    // Find relevant communities based on question
    const q = question.toLowerCase();
    const relevantCommunties = new Set<number>();

    for (const node of this.graph.nodes) {
      if (
        node.label.toLowerCase().includes(q.split(' ')[0] || '') ||
        q.includes(node.label.toLowerCase())
      ) {
        if (node.community !== undefined) {
          relevantCommunties.add(node.community);
        }
      }
    }

    const summaries: string[] = [];
    const pagesLoaded: string[] = [];

    for (const cid of relevantCommunties) {
      const summaryPath = join(this.wikiDir, 'summaries', `community-${cid}.txt`);
      if (existsSync(summaryPath)) {
        summaries.push(readFileSync(summaryPath, 'utf-8'));
        pagesLoaded.push(summaryPath);
      }
    }

    if (summaries.length === 0) {
      return { answer: '', tier: 2, tokens: 0, pages_loaded: [] };
    }

    const combined = summaries.join('\n---\n');
    const tokens = combined.length / 4;

    const systemPrompt = 'You are a helpful assistant answering questions about knowledge graph communities.';
    const userPrompt = `Question: "${question}"\n\nCommunity summaries:\n${combined}`;

    const result = await this.provider.complete(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      { max_tokens: 400 },
    );

    return {
      answer: result.content.trim(),
      tier: 2,
      tokens: tokens + (result.usage?.total_tokens ?? 0),
      pages_loaded: pagesLoaded,
    };
  }

  private async tier3WikiPages(question: string): Promise<TierResult> {
    const q = question.toLowerCase();
    const relevantNodes = this.graph.nodes.filter(
      (n) =>
        n.label.toLowerCase().includes(q.split(' ')[0] || '') ||
        q.includes(n.label.toLowerCase()),
    );

    const pageContents: string[] = [];
    const pagesLoaded: string[] = [];

    for (const node of relevantNodes.slice(0, 5)) {
      const pagePath = this.graphMap.getPageForNode(node.id);
      if (pagePath) {
        const fullPath = join(this.wikiDir, pagePath);
        if (existsSync(fullPath)) {
          const content = readFileSync(fullPath, 'utf-8');
          pageContents.push(`=== ${node.label} ===\n${content}`);
          pagesLoaded.push(fullPath);
        }
      }
    }

    if (pageContents.length === 0) {
      return { answer: '', tier: 3, tokens: 0, pages_loaded: [] };
    }

    const combined = pageContents.join('\n\n');
    const tokens = combined.length / 4;

    const systemPrompt = 'You are a helpful assistant answering questions using the provided wiki pages.';
    const userPrompt = `Question: "${question}"\n\nWiki content:\n${combined}`;

    const result = await this.provider.complete(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      { max_tokens: 800 },
    );

    return {
      answer: result.content.trim(),
      tier: 3,
      tokens: tokens + (result.usage?.total_tokens ?? 0),
      pages_loaded: pagesLoaded,
    };
  }

  private async tier4RawSources(question: string): Promise<QueryResult> {
    const q = question.toLowerCase();
    const relevantNodes = this.graph.nodes.filter((n) =>
      n.label.toLowerCase().includes(q.split(' ')[0] || ''),
    );

    const sources: string[] = [];
    const nodesTraversed: string[] = [];

    for (const node of relevantNodes.slice(0, 3)) {
      nodesTraversed.push(node.id);
      if (node.source_file) {
        sources.push(`${node.label}: ${node.source_file}`);
      }
      if (node.provenance) {
        sources.push(`${node.label}: ${node.provenance.join(', ')}`);
      }
    }

    const systemPrompt = 'You are a helpful assistant answering questions using raw source information.';
    const userPrompt = `Question: "${question}"\n\nRaw source information:\n${sources.join('\n') || 'No source information available.'}`;

    const result = await this.provider.complete(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      { max_tokens: 1000 },
    );

    return {
      answer: result.content.trim(),
      tier_reached: 4,
      tokens_consumed: result.usage?.total_tokens ?? 0,
      pages_loaded: sources,
      nodes_traversed: nodesTraversed,
    };
  }
}
