// GraphWiki Skill Generator — parses SKILL.md, generates platform-specific SKILL-*.md files

import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_MD_PATH = join(__dirname, '../../SKILL.md');
const OUTPUT_DIR = join(__dirname, '../..');

interface Frontmatter { name: string; version: string; description: string; platforms: string[] }
interface ParsedSkill { frontmatter: Frontmatter; sections: Map<string, string>; rawContent: string }
type OutputFormat = 'raw' | 'markdown' | 'plaintext' | 'json' | 'yaml';
interface PlatformSpec {
  filename: string;
  format: OutputFormat;
  /** Section heading overrides: canonical → platform-specific (markdown only) */
  headingOverrides?: Record<string, string>;
  /** Emit YAML frontmatter block in markdown output (default: true) */
  emitFrontmatter?: boolean;
}

// PLATFORM_SPECS is the single source of truth for all supported platforms.
const PLATFORM_SPECS: Record<string, PlatformSpec> = {
  claude:         { filename: 'SKILL-claude.md',         format: 'raw' },
  codex:          { filename: 'SKILL-codex.md',          format: 'markdown', emitFrontmatter: false, headingOverrides: {} },
  copilot:        { filename: 'SKILL-copilot.md',        format: 'markdown', emitFrontmatter: false, headingOverrides: { 'Context Loading Protocol': 'How to Use', 'Available Commands': 'Commands', 'Hard Constraints': 'Rules' } },
  gemini:         { filename: 'SKILL-gemini.md',         format: 'plaintext' },
  cursor:         { filename: 'SKILL-cursor.md',         format: 'json' },
  openclaw:       { filename: 'SKILL-openclaw.md',       format: 'yaml' },
  auggie:         { filename: 'SKILL-auggie.md',         format: 'markdown' },
  windsurf:       { filename: 'SKILL-windsurf.md',       format: 'markdown' },
  cody:           { filename: 'SKILL-cody.md',           format: 'markdown' },
  codewhisperer:  { filename: 'SKILL-codewhisperer.md',  format: 'markdown' },
  opencode:       { filename: 'SKILL-opencode.md',       format: 'markdown' },
  aider:          { filename: 'SKILL-aider.md',          format: 'markdown' },
  droid:          { filename: 'SKILL-droid.md',          format: 'markdown' },
  trae:           { filename: 'SKILL-trae.md',           format: 'markdown' },
  'trae-cn':      { filename: 'SKILL-trae-cn.md',        format: 'markdown' },
};

export function parseFrontmatter(content: string): Frontmatter {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error('Missing YAML frontmatter');
  const result: Record<string, unknown> = {};
  for (const line of (match[1] ?? '').split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key === 'platforms') {
      const m = value.match(/\[(.*)\]/);
      result[key] = m ? (m[1] ?? '').split(',').map(s => s.trim()) : [];
    } else {
      result[key] = value;
    }
  }
  return {
    name: result['name'] as string ?? '',
    version: result['version'] as string ?? '',
    description: result['description'] as string ?? '',
    platforms: (result['platforms'] as string[] | undefined) ?? [],
  };
}

export function parseSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  let heading = '', lines: string[] = [], inCode = false;
  for (const line of content.split('\n')) {
    if (line.startsWith('```')) inCode = !inCode;
    if (!inCode && /^#{1,3}\s+(.+)/.test(line)) {
      if (heading) sections.set(heading, lines.join('\n').trim());
      heading = line.replace(/^#+\s+/, '');
      lines = [];
    } else {
      lines.push(line);
    }
  }
  if (heading) sections.set(heading, lines.join('\n').trim());
  return sections;
}

async function parseSkillMd(): Promise<ParsedSkill> {
  const content = await readFile(SKILL_MD_PATH, 'utf-8');
  const frontmatter = parseFrontmatter(content);
  const sections = parseSections(content.replace(/^---[\s\S]*?---\n/, ''));
  return { frontmatter, sections, rawContent: content };
}

export function generate(parsed: ParsedSkill, platform: string): string {
  const spec = PLATFORM_SPECS[platform];
  if (!spec) throw new Error(`Unknown platform: ${platform}`);
  const { frontmatter: fm, sections, rawContent } = parsed;
  const protocol = sections.get('Context Loading Protocol') ?? '';
  const commands  = sections.get('Available Commands') ?? '';
  const constraints = sections.get('Hard Constraints') ?? '';

  switch (spec.format) {
    case 'raw': return rawContent;

    case 'markdown': {
      const ov = spec.headingOverrides ?? {};
      const ph = ov['Context Loading Protocol'] ?? 'Context Loading Protocol';
      const ch = ov['Available Commands'] ?? 'Available Commands';
      const hh = ov['Hard Constraints'] ?? 'Hard Constraints';
      if (spec.emitFrontmatter !== false) {
        return `---\nname: ${fm.name}\nversion: ${fm.version}\ndescription: ${fm.description}\nplatforms: [${fm.platforms.join(', ')}]\n---\n\n# ${fm.name}\n\n${fm.description}\n\n## Context Loading Protocol\n\n${protocol}\n\n## Available Commands\n\n${commands}\n\n## Hard Constraints\n\n${constraints}\n`;
      }
      const title = platform === 'copilot'
        ? `# ${fm.name}\n\n${fm.description}\n\n`
        : `# ${fm.name} - ${fm.description}\n\n`;
      let out = title;
      if (protocol)    out += `## ${ph}\n\n${protocol}\n\n`;
      if (commands)    out += `## ${ch}\n\n${commands}\n\n`;
      if (constraints) out += `## ${hh}\n\n${constraints}\n`;
      return out;
    }

    case 'plaintext': {
      let out = `${fm.name.toUpperCase()}\n${fm.description}\n\n`;
      if (protocol)    out += `CONTEXT LOADING PROTOCOL\n${protocol}\n\n`;
      if (commands)    out += `COMMANDS\n${commands}\n\n`;
      if (constraints) out += `HARD CONSTRAINTS\n${constraints}\n`;
      return out;
    }

    case 'json':
      return JSON.stringify({ name: fm.name, version: fm.version, description: fm.description, contextLoadingProtocol: protocol, commands, hardConstraints: constraints, platforms: fm.platforms }, null, 2);

    case 'yaml':
      return `name: ${fm.name}\nversion: ${fm.version}\ndescription: ${fm.description}\n\ncontext_loading_protocol: |\n${protocol.replace(/^/gm, '  ')}\n\ncommands: |\n${commands.replace(/^/gm, '  ')}\n\nhard_constraints: |\n${constraints.replace(/^/gm, '  ')}\n\nplatforms: [${fm.platforms.join(', ')}]\n`;
  }
}

export function generateHooksJsonEntries(): string {
  return JSON.stringify({
    PreToolUse:   [{ matcher: '*', hooks: [{ type: 'command', command: 'node "$GRAPHWIKI_PROJECT_ROOT"/scripts/graphwiki-pretool.mjs',        timeout: 3 }] }],
    SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: 'node "$GRAPHWIKI_PROJECT_ROOT"/scripts/graphwiki-session-start.mjs',  timeout: 3 }] }],
    PostToolUse:  [{ matcher: '*', hooks: [{ type: 'command', command: 'node "$GRAPHWIKI_PROJECT_ROOT"/scripts/graphwiki-posttool.mjs',       timeout: 3 }] }],
  }, null, 2);
}

async function generateAllFiles(parsed: ParsedSkill): Promise<void> {
  for (const [platform, spec] of Object.entries(PLATFORM_SPECS)) {
    await writeFile(join(OUTPUT_DIR, spec.filename), generate(parsed, platform), 'utf-8');
    console.error(`[GraphWiki] Generated: ${spec.filename}`);
  }
}

async function checkFilesMatch(parsed: ParsedSkill): Promise<boolean> {
  let ok = true;
  for (const [platform, spec] of Object.entries(PLATFORM_SPECS)) {
    const expected = generate(parsed, platform);
    const path = join(OUTPUT_DIR, spec.filename);
    try {
      const existing = await readFile(path, 'utf-8');
      if (existing !== expected) { console.error(`[GraphWiki] MISMATCH: ${spec.filename}`); ok = false; }
      else { console.error(`[GraphWiki] OK: ${spec.filename}`); }
    } catch { console.error(`[GraphWiki] MISSING: ${spec.filename}`); ok = false; }
  }
  return ok;
}

async function main(): Promise<void> {
  const checkMode = process.argv.slice(2).includes('--check');
  try {
    const parsed = await parseSkillMd();
    if (checkMode) {
      const ok = await checkFilesMatch(parsed);
      console.error(ok ? '[GraphWiki] All files match' : '[GraphWiki] Files differ - run without --check to regenerate');
      process.exit(ok ? 0 : 1);
    } else {
      await generateAllFiles(parsed);
      console.error('[GraphWiki] Skill generation complete');
    }
  } catch (err) {
    console.error(`[GraphWiki] Generator error: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
