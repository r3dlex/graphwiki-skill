import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type { GraphDocument, GraphDelta } from '../types.js';
import type { CommunityMeta, WikiPage, WikiPageFrontmatter } from './types.js';
import { WikiCompiler } from './compiler.js';
import matter from 'gray-matter';

export class WikiUpdater {
  private wikiDir: string;
  private compiler: WikiCompiler;

  constructor(wikiDir: string, compiler: WikiCompiler) {
    this.wikiDir = wikiDir;
    this.compiler = compiler;
  }

  async updatePages(
    graph: GraphDocument,
    delta: GraphDelta,
    communities: CommunityMeta[],
  ): Promise<void> {
    const communityMap = new Map<number, CommunityMeta>();
    for (const c of communities) {
      communityMap.set(c.id, c);
    }

    const changedCommunityIds = new Set<number>();

    for (const node of delta.modified) {
      if (node.community !== undefined) {
        changedCommunityIds.add(node.community);
      }
    }
    for (const node of delta.added.nodes) {
      if (node.community !== undefined) {
        changedCommunityIds.add(node.community);
      }
    }

    for (const [id, community] of communityMap) {
      if (changedCommunityIds.has(id)) {
        const communityNodes = graph.nodes.filter((n) => n.community === id);
        const communityEdges = graph.edges.filter(
          (e) =>
            communityNodes.some((n) => n.id === e.source) &&
            communityNodes.some((n) => n.id === e.target),
        );
        const page = await this.compiler.compileCommunity(
          community,
          communityNodes,
          communityEdges,
          graph.nodes,
          graph.edges,
        );
        await this.writeWikiPage(page);
      }
    }

    for (const node of delta.modified) {
      if (!changedCommunityIds.has(node.community ?? -1)) {
        const pagePath = this.getNodePagePath(node.id);
        if (existsSync(pagePath)) {
          const existing = readFileSync(pagePath, 'utf-8');
          const existingPage = matter(existing);
          const stage3 = await this.compiler.compileStage3(
            node.id,
            existingPage.content,
          );
          const newContent = existingPage.content + '\n\n' + stage3.deep_content;
          await this.diffBasedUpdate(
            pagePath,
            newContent,
            existingPage.data as WikiPageFrontmatter,
          );
        }
      }
    }
  }

  async diffBasedUpdate(
    pagePath: string,
    newContent: string,
    frontmatter: WikiPageFrontmatter,
  ): Promise<void> {
    const fmLines = [
      '---',
      ...Object.entries(frontmatter).map(([k, v]) => {
        if (Array.isArray(v)) return `${k}: [${v.join(', ')}]`;
        if (typeof v === 'object' && v !== null) return `${k}: ${JSON.stringify(v)}`;
        return `${k}: ${v}`;
      }),
      '---',
      '',
    ].join('\n');

    const fullContent = fmLines + newContent;
    writeFileSync(pagePath, fullContent, 'utf-8');
  }

  private async writeWikiPage(page: WikiPage): Promise<void> {
    const fullPath = join(this.wikiDir, page.path);
    const dir = dirname(fullPath);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const fmLines = [
      '---',
      ...Object.entries(page.frontmatter).map(([k, v]) => {
        if (Array.isArray(v)) return `${k}: [${v.join(', ')}]`;
        if (typeof v === 'object' && v !== null) return `${k}: ${JSON.stringify(v)}`;
        return `${k}: ${v}`;
      }),
      '---',
      '',
    ].join('\n');

    writeFileSync(fullPath, fmLines + page.content, 'utf-8');
  }

  /**
   * Full recompile: regenerate all wiki pages from the existing graph without
   * running extraction. Used by the --wiki-only build flag.
   */
  async recompile(graph: GraphDocument): Promise<void> {
    // Derive communities from node.community assignments
    const communityIds = new Set<number>();
    for (const node of graph.nodes) {
      if (node.community !== undefined) {
        communityIds.add(node.community);
      }
    }

    for (const communityId of communityIds) {
      const communityNodes = graph.nodes.filter(n => n.community === communityId);
      const communityEdges = graph.edges.filter(
        e => communityNodes.some(n => n.id === e.source) && communityNodes.some(n => n.id === e.target),
      );
      const meta: CommunityMeta = {
        id: communityId,
        node_count: communityNodes.length,
        label: `community-${communityId}`,
      };
      const page = await this.compiler.compileCommunity(meta, communityNodes, communityEdges, graph.nodes, graph.edges);
      await this.writeWikiPage(page);
    }
  }

  private getNodePagePath(nodeId: string): string {
    return join(this.wikiDir, 'nodes', `${nodeId}.md`);
  }
}
