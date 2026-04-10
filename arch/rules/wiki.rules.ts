import { readdir, readFile } from 'fs/promises';
import { join, resolve } from 'path';
import type { Rule, RuleContext } from 'archgate';

const REQUIRED_FRONTMATTER = ['graph_nodes', 'title', 'type', 'sources', 'related', 'confidence', 'content_hash'];
const WIKI_DIR = resolve('wiki');

function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const fm: Record<string, unknown> = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key === 'graph_nodes' || key === 'sources' || key === 'related') {
      fm[key] = value ? value.split(',').map((v) => v.trim()) : [];
    } else {
      fm[key] = value;
    }
  }
  return fm;
}

async function getWikiFilePaths(): Promise<string[]> {
  const entries = await readdir(WIKI_DIR).catch(() => []);
  return entries
    .filter((e) => e.endsWith('.md'))
    .map((e) => join(WIKI_DIR, e));
}

async function getDefinedTerms(): Promise<Set<string>> {
  const files = await getWikiFilePaths();
  const terms = new Set<string>();
  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const head = content.split('\n').find((l) => l.startsWith('# '));
    if (head) {
      terms.add(head.slice(2).trim());
    }
  }
  return terms;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const { stat } = await import('fs/promises');
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export const gwWiki001: Rule = {
  id: 'gw-wiki-001',
  name: 'WikiPage frontmatter schema',
  severity: 'error',
  scope: 'wiki/',
  assert: async (ctx: RuleContext) => {
    const files = await getWikiFilePaths();
    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      const fm = parseFrontmatter(content);
      for (const key of REQUIRED_FRONTMATTER) {
        if (!(key in fm)) {
          const rel = file.replace(resolve('.') + '/', '');
          ctx.violation(`WikiPage ${rel} missing required frontmatter field: ${key} — gw-wiki-001`);
        }
      }
    }
  },
};

export const gwWiki002: Rule = {
  id: 'gw-wiki-002',
  name: 'No raw/ file mutations',
  severity: 'error',
  scope: 'src/',
  assert: async (ctx: RuleContext) => {
    const { Project } = await import('ts-morph');
    const project = new Project({ tsConfigFilePath: './tsconfig.json' });
    const srcFiles = project.getSourceFiles('src/**/*.ts');
    for (const sf of srcFiles) {
      const text = sf.getFullText();
      // Detect write operations targeting raw/ path via string literals or path joins
      const writePatterns = [
        /writeFile\s*\(\s*['"`](?:[^'"`]*\/)?raw\/|\/raw\//,
        /writeFileSync\s*\(\s*['"`](?:[^'"`]*\/)?raw\/|\/raw\//,
        /copyFile\s*\([^)]*['"`](?:[^'"`]*\/)?raw\/|\/raw\//,
        /copyFileSync\s*\([^)]*['"`](?:[^'"`]*\/)?raw\/|\/raw\//,
        /mkdir(?:Sync)?\([^)]*['"`](?:[^'"`]*\/)?raw\/|\/raw\//,
        /rename\s*\([^)]*['"`](?:[^'"`]*\/)?raw\/|\/raw\//,
      ];
      let found = false;
      for (const pattern of writePatterns) {
        if (pattern.test(text)) {
          found = true;
          ctx.violation(`File ${sf.getFilePath()} writes to or modifies raw/ — gw-wiki-002`);
          break;
        }
      }
      if (found) break;
    }
  },
};

export const gwWiki003: Rule = {
  id: 'gw-wiki-003',
  name: 'Wiki link validation',
  severity: 'error',
  scope: 'wiki/',
  assert: async (ctx: RuleContext) => {
    const files = await getWikiFilePaths();
    const definedTerms = await getDefinedTerms();
    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      const rel = file.replace(resolve('.') + '/', '');
      const linkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
      let match;
      while ((match = linkRegex.exec(content)) !== null) {
        let link = match[1].trim();
        // Resolve wiki link to file path
        if (!link.endsWith('.md')) link = link + '.md';
        const targetPath = join(WIKI_DIR, link);
        const resolved = definedTerms.has(link) || (await fileExists(targetPath));
        if (!resolved) {
          ctx.violation(`WikiPage ${rel} contains broken wiki link: [[${match[1].trim()}]] — gw-wiki-003`);
        }
      }
    }
  },
};

export const wikiRules = [gwWiki001, gwWiki002, gwWiki003];
export default wikiRules;
