import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface WikiGraphMapData {
  node_to_page: Record<string, string>;
  page_to_nodes: Record<string, string[]>;
}

export class WikiGraphMap {
  private mapPath: string;
  private data: WikiGraphMapData;

  constructor(mapPath: string) {
    this.mapPath = mapPath;
    this.data = { node_to_page: {}, page_to_nodes: {} };
    this.load();
  }

  addMapping(nodeId: string, pagePath: string): void {
    this.data.node_to_page[nodeId] = pagePath;

    if (!this.data.page_to_nodes[pagePath]) {
      this.data.page_to_nodes[pagePath] = [];
    }
    if (!this.data.page_to_nodes[pagePath].includes(nodeId)) {
      this.data.page_to_nodes[pagePath].push(nodeId);
    }

    this.save();
  }

  removeMapping(nodeId: string): void {
    const pagePath = this.data.node_to_page[nodeId];
    if (pagePath) {
      delete this.data.node_to_page[nodeId];

      if (this.data.page_to_nodes[pagePath]) {
        this.data.page_to_nodes[pagePath] = this.data.page_to_nodes[pagePath].filter(
          (id) => id !== nodeId,
        );
        if (this.data.page_to_nodes[pagePath].length === 0) {
          delete this.data.page_to_nodes[pagePath];
        }
      }
    }

    this.save();
  }

  getPageForNode(nodeId: string): string | null {
    return this.data.node_to_page[nodeId] ?? null;
  }

  getNodesForPage(pagePath: string): string[] {
    return this.data.page_to_nodes[pagePath] ?? [];
  }

  getAllMappings(): Record<string, string> {
    return { ...this.data.node_to_page };
  }

  private load(): void {
    if (existsSync(this.mapPath)) {
      try {
        const raw = readFileSync(this.mapPath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data = {
          node_to_page: parsed.node_to_page || {},
          page_to_nodes: parsed.page_to_nodes || {},
        };
      } catch {
        this.data = { node_to_page: {}, page_to_nodes: {} };
      }
    }
  }

  private save(): void {
    const dir = join(this.mapPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.mapPath, JSON.stringify(this.data, null, 2), 'utf-8');
  }
}
