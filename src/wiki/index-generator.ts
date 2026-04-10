import type {
  GraphDocument,
  GraphNode,
  GraphEdge,
} from '../types.js';
import type {
  WikiPage,
} from './types.js';

export class IndexGenerator {
  async generate(wikiPages: WikiPage[], graph: GraphDocument): Promise<string> {
    const lines: string[] = [
      '# GraphWiki Index',
      '',
      `Generated at: ${new Date().toISOString()}`,
      '',
      '---',
      '',
      '## Graph Metadata',
      '',
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Nodes | ${graph.nodes.length} |`,
      `| Edges | ${graph.edges.length} |`,
      `| Communities | ${this.countCommunities(graph)} |`,
      '',
      '---',
      '',
      '## Page Catalog',
      '',
    ];

    const byType = this.groupByType(wikiPages);
    const typeLabels: Record<string, string> = {
      concept: 'Concepts',
      entity: 'Entities',
      source: 'Sources',
      comparison: 'Comparisons',
    };

    for (const [type, pages] of Object.entries(byType)) {
      const label = typeLabels[type] || type.charAt(0).toUpperCase() + type.slice(1);
      lines.push(`### ${label}`, '');
      for (const page of pages) {
        lines.push(`- [[${page.path}]] — ${page.frontmatter.label}`);
      }
      lines.push('');
    }

    lines.push('---', '', '## Related Links Summary', '');

    const relatedLinks = this.summarizeRelatedLinks(wikiPages);
    if (relatedLinks.length > 0) {
      lines.push(`Total cross-references: ${relatedLinks.length}`);
      lines.push('');
      for (const link of relatedLinks.slice(0, 20)) {
        lines.push(`- [[${link.source}]] → [[${link.target}]]`);
      }
      if (relatedLinks.length > 20) {
        lines.push(`- ... and ${relatedLinks.length - 20} more`);
      }
    } else {
      lines.push('No cross-references found.');
    }

    return lines.join('\n');
  }

  private countCommunities(graph: GraphDocument): number {
    const communityIds = new Set<number>();
    for (const node of graph.nodes) {
      if (node.community !== undefined) {
        communityIds.add(node.community);
      }
    }
    return communityIds.size;
  }

  private groupByType(wikiPages: WikiPage[]): Record<string, WikiPage[]> {
    const groups: Record<string, WikiPage[]> = {};
    for (const page of wikiPages) {
      const type = page.frontmatter.type || 'unknown';
      if (!groups[type]) groups[type] = [];
      groups[type].push(page);
    }
    return groups;
  }

  private summarizeRelatedLinks(
    wikiPages: WikiPage[],
  ): Array<{ source: string; target: string }> {
    const links: Array<{ source: string; target: string }> = [];
    const linkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

    for (const page of wikiPages) {
      let match;
      while ((match = linkRegex.exec(page.content)) !== null) {
        const target = match[1].trim();
        if (target !== page.path) {
          links.push({ source: page.path, target });
        }
      }
    }

    return links;
  }
}
