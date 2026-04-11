// GraphWiki v2 Skill Generator
// Parses SKILL.md and generates platform-specific SKILL-*.md files

import { readFile, writeFile, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_MD_PATH = join(__dirname, '../../SKILL.md');
const OUTPUT_DIR = join(__dirname, '../..');

// ============================================================
// Types
// ============================================================

interface Frontmatter {
  name: string;
  version: string;
  description: string;
  platforms: string[];
}

interface ParsedSkill {
  frontmatter: Frontmatter;
  sections: Map<string, string>;
  rawContent: string;
}

// ============================================================
// YAML Frontmatter Parser
// ============================================================

function parseFrontmatter(content: string): Frontmatter {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    throw new Error('Missing YAML frontmatter');
  }

  const yaml = match[1];
  const result: Record<string, unknown> = {};

  for (const line of yaml.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    if (key === 'platforms') {
      // Parse array: [claude, codex, gemini]
      const arrayMatch = value.match(/\[(.*)\]/);
      if (arrayMatch) {
        result[key] = arrayMatch[1].split(',').map(s => s.trim());
      }
    } else {
      result[key] = value;
    }
  }

  return result as Frontmatter;
}

// ============================================================
// Markdown Section Parser
// ============================================================

function parseSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = content.split('\n');

  let currentHeading = '';
  let currentContent: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    // Track code blocks to avoid false heading matches
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
    }

    // Match h1/h2/h3 headings outside code blocks
    if (!inCodeBlock && /^#{1,3}\s+(.+)/.test(line)) {
      // Save previous section
      if (currentHeading) {
        sections.set(currentHeading, currentContent.join('\n').trim());
      }

      currentHeading = line.replace(/^#+\s+/, '');
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentHeading) {
    sections.set(currentHeading, currentContent.join('\n').trim());
  }

  return sections;
}

// ============================================================
// SKILL.md Parser
// ============================================================

async function parseSkillMd(): Promise<ParsedSkill> {
  const content = await readFile(SKILL_MD_PATH, 'utf-8');
  const frontmatter = parseFrontmatter(content);

  // Remove frontmatter for section parsing
  const body = content.replace(/^---[\s\S]*?---\n/, '');
  const sections = parseSections(body);

  return { frontmatter, sections, rawContent: content };
}

// ============================================================
// Platform-Specific Generators
// ============================================================

function generateClaude(parsed: ParsedSkill): string {
  // Full SKILL.md content with YAML frontmatter - prompt.md compatible
  return parsed.rawContent;
}

function generateCodex(parsed: ParsedSkill): string {
  // Abbreviated markdown for Codex
  const { frontmatter, sections } = parsed;

  let output = `# ${frontmatter.name} - ${frontmatter.description}\n\n`;

  // Context Loading Protocol
  const protocol = sections.get('Context Loading Protocol') ?? '';
  if (protocol) {
    output += `## Context Loading Protocol\n\n${protocol}\n\n`;
  }

  // Available Commands
  const commands = sections.get('Available Commands') ?? '';
  if (commands) {
    output += `## Available Commands\n\n${commands}\n\n`;
  }

  // Hard Constraints
  const constraints = sections.get('Hard Constraints') ?? '';
  if (constraints) {
    output += `## Hard Constraints\n\n${constraints}\n`;
  }

  return output;
}

function generateCopilot(parsed: ParsedSkill): string {
  // Markdown for GitHub Copilot
  const { frontmatter, sections } = parsed;

  let output = `# ${frontmatter.name}\n\n`;
  output += `${frontmatter.description}\n\n`;

  // Context Loading Protocol
  const protocol = sections.get('Context Loading Protocol') ?? '';
  if (protocol) {
    output += `## How to Use\n\n${protocol}\n\n`;
  }

  // Commands
  const commands = sections.get('Available Commands') ?? '';
  if (commands) {
    output += `## Commands\n\n${commands}\n\n`;
  }

  // Constraints
  const constraints = sections.get('Hard Constraints') ?? '';
  if (constraints) {
    output += `## Rules\n\n${constraints}\n`;
  }

  return output;
}

function generateGemini(parsed: ParsedSkill): string {
  // Plain text sections for Gemini
  const { frontmatter, sections } = parsed;

  let output = `${frontmatter.name.toUpperCase()}\n`;
  output += `${frontmatter.description}\n\n`;

  // Context Loading Protocol as plain text
  const protocol = sections.get('Context Loading Protocol') ?? '';
  if (protocol) {
    output += `CONTEXT LOADING PROTOCOL\n${protocol}\n\n`;
  }

  // Commands
  const commands = sections.get('Available Commands') ?? '';
  if (commands) {
    output += `COMMANDS\n${commands}\n\n`;
  }

  // Hard Constraints
  const constraints = sections.get('Hard Constraints') ?? '';
  if (constraints) {
    output += `HARD CONSTRAINTS\n${constraints}\n`;
  }

  return output;
}

function generateCursor(parsed: ParsedSkill): string {
  // JSON format for Cursor
  const { frontmatter, sections } = parsed;

  const protocol = sections.get('Context Loading Protocol') ?? '';
  const commands = sections.get('Available Commands') ?? '';
  const constraints = sections.get('Hard Constraints') ?? '';

  return JSON.stringify({
    name: frontmatter.name,
    version: frontmatter.version,
    description: frontmatter.description,
    contextLoadingProtocol: protocol,
    commands: commands,
    hardConstraints: constraints,
    platforms: frontmatter.platforms,
  }, null, 2);
}

function generateOpenClaw(parsed: ParsedSkill): string {
  // YAML format for OpenClaw
  const { frontmatter, sections } = parsed;

  const protocol = sections.get('Context Loading Protocol') ?? '';
  const commands = sections.get('Available Commands') ?? '';
  const constraints = sections.get('Hard Constraints') ?? '';

  return `name: ${frontmatter.name}
version: ${frontmatter.version}
description: ${frontmatter.description}

context_loading_protocol: |
${protocol.replace(/^/gm, '  ')}

commands: |
${commands.replace(/^/gm, '  ')}

hard_constraints: |
${constraints.replace(/^/gm, '  ')}

platforms: [${frontmatter.platforms.join(', ')}]
`;
}

function generateAuggie(parsed: ParsedSkill): string {
  // YAML frontmatter format for Auggie skill at .augment/skills/graphwiki/SKILL.md
  const { frontmatter, sections } = parsed;

  const protocol = sections.get('Context Loading Protocol') ?? '';
  const commands = sections.get('Available Commands') ?? '';
  const constraints = sections.get('Hard Constraints') ?? '';

  return `---
name: ${frontmatter.name}
version: ${frontmatter.version}
description: ${frontmatter.description}
platforms: [${frontmatter.platforms.join(', ')}]
---

# ${frontmatter.name}

${frontmatter.description}

## Context Loading Protocol

${protocol}

## Available Commands

${commands}

## Hard Constraints

${constraints}
`;
}

// ============================================================
// Hook JSON Generator
// ============================================================

export function generateHooksJsonEntries(): string {
  // Returns JSON string of hook entries for hooks.json
  return JSON.stringify({
    PreToolUse: [{
      matcher: "*",
      hooks: [{
        type: "command",
        command: "node \"$GRAPHWIKI_PROJECT_ROOT\"/scripts/graphwiki-pretool.mjs",
        timeout: 3
      }]
    }],
    SessionStart: [{
      matcher: "*",
      hooks: [{
        type: "command",
        command: "node \"$GRAPHWIKI_PROJECT_ROOT\"/scripts/graphwiki-session-start.mjs",
        timeout: 3
      }]
    }],
    PostToolUse: [{
      matcher: "*",
      hooks: [{
        type: "command",
        command: "node \"$GRAPHWIKI_PROJECT_ROOT\"/scripts/graphwiki-posttool.mjs",
        timeout: 3
      }]
    }]
  }, null, 2);
}

// ============================================================
// File Generation
// ============================================================

async function generateAllFiles(parsed: ParsedSkill): Promise<void> {
  const files: Array<{ name: string; content: string }> = [
    { name: 'SKILL-claude.md', content: generateClaude(parsed) },
    { name: 'SKILL-codex.md', content: generateCodex(parsed) },
    { name: 'SKILL-copilot.md', content: generateCopilot(parsed) },
    { name: 'SKILL-gemini.md', content: generateGemini(parsed) },
    { name: 'SKILL-cursor.md', content: generateCursor(parsed) },
    { name: 'SKILL-openclaw.md', content: generateOpenClaw(parsed) },
    { name: 'SKILL-auggie.md', content: generateAuggie(parsed) },
  ];

  for (const file of files) {
    const filePath = join(OUTPUT_DIR, file.name);
    await writeFile(filePath, file.content, 'utf-8');
    console.error(`[GraphWiki] Generated: ${file.name}`);
  }
}

// ============================================================
// --check Mode
// ============================================================

async function checkFilesMatch(parsed: ParsedSkill): Promise<boolean> {
  const files: Array<{ name: string; content: string }> = [
    { name: 'SKILL-claude.md', content: generateClaude(parsed) },
    { name: 'SKILL-codex.md', content: generateCodex(parsed) },
    { name: 'SKILL-copilot.md', content: generateCopilot(parsed) },
    { name: 'SKILL-gemini.md', content: generateGemini(parsed) },
    { name: 'SKILL-cursor.md', content: generateCursor(parsed) },
    { name: 'SKILL-openclaw.md', content: generateOpenClaw(parsed) },
    { name: 'SKILL-auggie.md', content: generateAuggie(parsed) },
  ];

  let allMatch = true;

  for (const file of files) {
    const filePath = join(OUTPUT_DIR, file.name);
    try {
      const existing = await readFile(filePath, 'utf-8');
      if (existing !== file.content) {
        console.error(`[GraphWiki] MISMATCH: ${file.name}`);
        allMatch = false;
      } else {
        console.error(`[GraphWiki] OK: ${file.name}`);
      }
    } catch {
      console.error(`[GraphWiki] MISSING: ${file.name}`);
      allMatch = false;
    }
  }

  return allMatch;
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const checkMode = args.includes('--check');

  try {
    const parsed = await parseSkillMd();

    if (checkMode) {
      const matches = await checkFilesMatch(parsed);
      if (matches) {
        console.error('[GraphWiki] All files match');
        process.exit(0);
      } else {
        console.error('[GraphWiki] Files differ - run without --check to regenerate');
        process.exit(1);
      }
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
