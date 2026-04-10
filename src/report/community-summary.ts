import type { GraphNode, GraphEdge, LLMProvider, Message } from '../types.js';
import type { CommunityMeta } from '../wiki/types.js';

export class CommunitySummarizer {
  private provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  async summarize(
    community: CommunityMeta,
    nodes: GraphNode[],
    edges: GraphEdge[],
  ): Promise<string> {
    const communityNodes = nodes.filter((n) => n.community === community.id);
    const communityEdges = edges.filter(
      (e) =>
        communityNodes.some((n) => n.id === e.source) &&
        communityNodes.some((n) => n.id === e.target),
    );

    const nodeList = communityNodes
      .map((n) => `- **${n.label}** (${n.type})${n.provenance ? ` — source: ${n.provenance.join(', ')}` : ''}`)
      .join('\n');

    const edgeList = communityEdges
      .map((e) => {
        const src = communityNodes.find((n) => n.id === e.source)?.label || e.source;
        const tgt = communityNodes.find((n) => n.id === e.target)?.label || e.target;
        return `- ${src} --${e.label || 'related'}--> ${tgt} (weight: ${e.weight.toFixed(2)})`;
      })
      .join('\n');

    const systemPrompt =
      'You are a technical writer creating concise community summaries. Generate a 200-500 token summary.';
    const userPrompt = `Summarize community "${community.label || `Community ${community.id}`}" in 200-500 tokens.

This community contains ${communityNodes.length} nodes and ${communityEdges.length} edges.

Nodes:
${nodeList || '(none)'}

Edges:
${edgeList || '(none)'}

Provide a concise summary that captures the main themes, key entities, and relationships within this community.`;

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const result = await this.provider.complete(messages, {
      max_tokens: 500,
    });

    return result.content.trim();
  }
}
