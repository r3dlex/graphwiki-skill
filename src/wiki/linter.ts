import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import type { GraphDocument } from '../types.js';
import type {
  WikiPage,
  WikiPageFrontmatter,
  LintResult,
  Contradiction,
  MissingSource,
  BrokenLink,
} from './types.js';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class WikiLinter {
  private graph: GraphDocument;
  private wikiDir: string;

  constructor(graph: GraphDocument, wikiDir: string) {
    this.graph = graph;
    this.wikiDir = wikiDir;
  }

  async lint(): Promise<LintResult> {
    const wikiPages = await this.loadWikiPages();
    const contradictions = this.detectContradictions(wikiPages);
    const missingSources = this.checkCompleteness();
    const brokenLinks = await this.checkWikiLinks();

    return {
      valid: contradictions.length === 0 && brokenLinks.length === 0,
      contradictions,
      missing_sources: missingSources,
      broken_links: brokenLinks,
    };
  }

  detectContradictions(wikiPages: WikiPage[]): Contradiction[] {
    const contradictions: Contradiction[] = [];
    const contradictEdges = this.graph.edges.filter((e) => e.label === 'contradicts');

    for (const edge of contradictEdges) {
      const sourceNode = this.graph.nodes.find((n) => n.id === edge.source);
      const targetNode = this.graph.nodes.find((n) => n.id === edge.target);

      if (sourceNode && targetNode) {
        const sourcePage = wikiPages.find(
          (p) => p.frontmatter.node_id === edge.source,
        );
        const targetPage = wikiPages.find(
          (p) => p.frontmatter.node_id === edge.target,
        );

        if (sourcePage && targetPage) {
          if (
            sourcePage.content.toLowerCase().includes(targetNode.label.toLowerCase()) ||
            targetPage.content.toLowerCase().includes(sourceNode.label.toLowerCase())
          ) {
            contradictions.push({
              node_id: edge.source,
              wiki_content: sourcePage.content.substring(0, 200),
              edge_label: 'contradicts',
              related_nodes: [edge.target],
            });
          }
        }
      }
    }

    return contradictions;
  }

  checkCompleteness(): MissingSource[] {
    const missingSources: MissingSource[] = [];
    const isPartial = this.graph.metadata?.completeness !== undefined &&
      this.graph.metadata.completeness < 1.0;

    if (isPartial || this.graph.metadata?.completeness === undefined) {
      for (const node of this.graph.nodes) {
        if (!node.provenance || node.provenance.length === 0) {
          missingSources.push({
            node_id: node.id,
            node_label: node.label,
            community: node.community ?? -1,
          });
        }
      }
    }

    return missingSources;
  }

  async checkWikiLinks(): Promise<BrokenLink[]> {
    const brokenLinks: BrokenLink[] = [];
    const wikiPages = await this.loadWikiPages();
    const validPaths = new Set(wikiPages.map((p) => p.path));

    const linkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

    for (const page of wikiPages) {
      let match;
      while ((match = linkRegex.exec(page.content)) !== null) {
        const linkPath = match[1].trim();
        const linkText = match[2]?.trim() || linkPath;

        if (linkPath.startsWith('/')) {
          const relativePath = join(this.wikiDir, linkPath + '.md');
          if (!existsSync(relativePath)) {
            brokenLinks.push({
              source_page: page.path,
              target_path: linkPath,
              link_text: linkText,
            });
          }
        } else {
          if (!validPaths.has(linkPath) && !validPaths.has(linkPath + '.md')) {
            const fullPath = join(this.wikiDir, 'wiki', linkPath + '.md');
            if (!existsSync(fullPath)) {
              brokenLinks.push({
                source_page: page.path,
                target_path: linkPath,
                link_text: linkText,
              });
            }
          }
        }
      }
    }

    return brokenLinks;
  }

  private async loadWikiPages(): Promise<WikiPage[]> {
    const pages: WikiPage[] = [];
    const wikiPath = join(this.wikiDir, 'wiki');

    if (!existsSync(wikiPath)) return pages;

    const walkDir = (dir: string) => {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          walkDir(join(dir, entry.name));
        } else if (entry.name.endsWith('.md')) {
          const filePath = join(dir, entry.name);
          try {
            const raw = readFileSync(filePath, 'utf-8');
            const { data, content } = matter(raw);
            pages.push({
              path: relative(this.wikiDir, filePath),
              frontmatter: data as WikiPageFrontmatter,
              content,
            });
          } catch {
            // skip malformed files
          }
        }
      }
    };

    walkDir(wikiPath);
    return pages;
  }
}
