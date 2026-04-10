// Multi-platform skill installer for GraphWiki v2
// Supports: claude, codex, gemini, cursor, openclaw

import { writeFile, mkdir, readFile, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

export type Platform = 'claude' | 'codex' | 'gemini' | 'cursor' | 'openclaw';

/**
 * Skill definition
 */
interface SkillDefinition {
  name: string;
  description: string;
  prompt: string;
  tools?: string[];
}

/**
 * GraphWiki skill definitions for each platform
 */
const SKILL_DEFINITIONS: Record<Platform, SkillDefinition> = {
  claude: {
    name: 'graphwiki',
    description: 'Query and navigate the GraphWiki knowledge graph',
    prompt: `You have access to the GraphWiki knowledge graph system.

**Available Commands:**
- \`graphwiki build <path>\` - Build/update the knowledge graph
- \`graphwiki query <question>\` - Query the graph with a question
- \`graphwiki status\` - Show graph statistics
- \`graphwiki path <nodeA> <nodeB>\` - Find shortest path between nodes

**Context Loading Protocol:**
1. Read graphwiki-out/GRAPH_REPORT.md for overview
2. Use \`graphwiki path\` for structural queries
3. Read wiki/index.md for relevant pages
4. Read targeted wiki pages (max 3)
5. Only read raw/ files for verification

**Rules:**
- Always load context through the graph, not files directly
- File query results back into wiki/ as new pages
- Never modify files in raw/ (immutable sources)`,
    tools: ['bash', 'read', 'edit', 'glob'],
  },

  codex: {
    name: 'graphwiki',
    description: 'GraphWiki integration for Codex',
    prompt: `GraphWiki Knowledge Graph Integration

**Purpose:** Navigate and query the GraphWiki knowledge base

**Commands:**
- graphwiki build . --update    # Incremental rebuild
- graphwiki query "question"   # Ask questions
- graphwiki status             # Show stats

**Protocol:**
1. Check graphwiki-out/GRAPH_REPORT.md first
2. Use graphwiki path for structural navigation
3. Follow wiki page links for context
4. Query results should update wiki/`,
    tools: [],
  },

  gemini: {
    name: 'graphwiki',
    description: 'GraphWiki integration for Gemini',
    prompt: `GraphWiki Knowledge Graph

You can query the GraphWiki knowledge base using the graphwiki CLI tool.

**Usage:**
- Build graph: graphwiki build <directory>
- Query: graphwiki query "your question"
- Navigate: graphwiki path <nodeA> <nodeB>

**Best Practices:**
- Use graphwiki status to understand graph size
- Follow wiki page links for deep dives
- graphwiki lint for health checks`,
    tools: [],
  },

  cursor: {
    name: 'GraphWiki',
    description: 'Cursor IDE integration for GraphWiki',
    prompt: `GraphWiki Integration for Cursor

Access the GraphWiki knowledge graph directly from Cursor.

**Features:**
- Automatic context loading from graph
- Query-based navigation
- Path finding between concepts

**Usage:**
Use the terminal to run graphwiki commands:
\`\`\`bash
graphwiki query "your question"
graphwiki status
\`\`\``,
    tools: [],
  },

  openclaw: {
    name: 'graphwiki',
    description: 'OpenClaw integration for GraphWiki',
    prompt: `GraphWiki Knowledge Graph Plugin

**Commands:**
- /graphwiki build   Build/update graph
- /graphwiki query   Query the knowledge base
- /graphwiki status  Show statistics

**Configuration:**
Add to your OpenClaw configuration for automatic context.`,
    tools: [],
  },
};

/**
 * Installer for Claude Code (native skill format)
 */
async function installClaudeSkill(skillPath: string): Promise<void> {
  const skill = SKILL_DEFINITIONS.claude;

  const content = `# ${skill.name}

${skill.description}

## Prompt

\`\`\`
${skill.prompt}
\`\`\`

## Tools

${skill.tools?.map(t => `- ${t}`).join('\n') ?? 'No tools required'}
`;

  await mkdir(join(skillPath, skill.name), { recursive: true });
  await writeFile(join(skillPath, skill.name, 'prompt.md'), content, 'utf-8');
}

/**
 * Installer for Codex
 */
async function installCodexSkill(skillPath: string): Promise<void> {
  const skill = SKILL_DEFINITIONS.codex;

  await mkdir(skillPath, { recursive: true });
  await writeFile(
    join(skillPath, 'graphwiki.md'),
    `# ${skill.name}\n\n${skill.description}\n\n${skill.prompt}`,
    'utf-8'
  );
}

/**
 * Installer for Gemini
 */
async function installGeminiSkill(skillPath: string): Promise<void> {
  const skill = SKILL_DEFINITIONS.gemini;

  await mkdir(skillPath, { recursive: true });
  await writeFile(
    join(skillPath, 'graphwiki-prompt.txt'),
    `${skill.name}\n\n${skill.description}\n\n${skill.prompt}`,
    'utf-8'
  );
}

/**
 * Installer for Cursor
 */
async function installCursorSkill(skillPath: string): Promise<void> {
  const skill = SKILL_DEFINITIONS.cursor;

  await mkdir(skillPath, { recursive: true });
  await writeFile(
    join(skillPath, 'graphwiki.json'),
    JSON.stringify({
      name: skill.name,
      description: skill.description,
      prompt: skill.prompt,
    }, null, 2),
    'utf-8'
  );
}

/**
 * Installer for OpenClaw
 */
async function installOpenClawSkill(skillPath: string): Promise<void> {
  const skill = SKILL_DEFINITIONS.openclaw;

  await mkdir(skillPath, { recursive: true });
  await writeFile(
    join(skillPath, 'graphwiki.yaml'),
    `name: ${skill.name}\ndescription: ${skill.description}\nprompt: |\n  ${skill.prompt.replace(/\n/g, '\n  ')}`,
    'utf-8'
  );
}

/**
 * Detect current platform
 */
export async function detectPlatform(): Promise<Platform> {
  // Check Claude Code
  try {
    await access(join(process.env.HOME ?? '', '.claude', 'settings.json'));
    return 'claude';
  } catch {}

  // Check for Cursor
  try {
    await access(join(process.env.HOME ?? '', '.cursor', 'settings.json'));
    return 'cursor';
  } catch {}

  // Check environment variables
  if (process.env.ANTHROPIC_API_KEY) return 'claude';
  if (process.env.OPENAI_API_KEY) return 'codex';
  if (process.env.GOOGLE_API_KEY) return 'gemini';

  return 'claude'; // Default
}

/**
 * Install GraphWiki skill for a specific platform
 */
export async function installSkill(
  platform: Platform,
  installPath?: string
): Promise<void> {
  const paths: Record<Platform, () => Promise<string>> = {
    claude: async () => {
      const base = join(process.env.HOME ?? '.', '.claude', 'skills');
      await installClaudeSkill(base);
      return join(base, 'graphwiki');
    },

    codex: async () => {
      const base = installPath ?? join(process.cwd(), '.codex', 'skills');
      await installCodexSkill(base);
      return join(base, 'graphwiki.md');
    },

    gemini: async () => {
      const base = installPath ?? join(process.cwd(), '.gemini', 'skills');
      await installGeminiSkill(base);
      return join(base, 'graphwiki-prompt.txt');
    },

    cursor: async () => {
      const base = installPath ?? join(process.env.HOME ?? '.', '.cursor', 'extensions');
      await installCursorSkill(base);
      return join(base, 'graphwiki.json');
    },

    openclaw: async () => {
      const base = installPath ?? join(process.cwd(), '.openclaw', 'skills');
      await installOpenClawSkill(base);
      return join(base, 'graphwiki.yaml');
    },
  };

  const installDir = await paths[platform]();
  console.log(`[GraphWiki] Skill installed for ${platform} at: ${installDir}`);
}

/**
 * Install for all detected platforms
 */
export async function installAllSkills(installPath?: string): Promise<void> {
  const platform = await detectPlatform();
  await installSkill(platform, installPath);
}

/**
 * Get skill definition for platform
 */
export function getSkillDefinition(platform: Platform): SkillDefinition {
  return SKILL_DEFINITIONS[platform];
}

// ============================================================
// Hook Installation
// ============================================================

const HOOKS_JSON_PATH = join(process.env.HOME ?? '.', '.claude', 'plugins', 'marketplaces', 'omc', 'hooks', 'hooks.json');

interface HookEntry {
  type: string;
  command: string;
  timeout?: number;
}

interface HookMatcher {
  matcher: string;
  hooks: HookEntry[];
}

interface HooksJson {
  hooks: Record<string, HookMatcher[]>;
}

/**
 * Deep merge hook arrays - preserves existing entries, appends new ones
 */
function deepMergeHooks(existing: HookMatcher[], newEntries: HookMatcher[]): HookMatcher[] {
  const result = [...existing];

  for (const newMatcher of newEntries) {
    const existingMatcher = result.find(m => m.matcher === newMatcher.matcher);
    if (existingMatcher) {
      // Merge hooks arrays - avoid duplicates by command
      const existingCommands = new Set(existingMatcher.hooks.map(h => h.command));
      for (const hook of newMatcher.hooks) {
        if (!existingCommands.has(hook.command)) {
          existingMatcher.hooks.push(hook);
        }
      }
    } else {
      result.push(newMatcher);
    }
  }

  return result;
}

/**
 * Install PreToolUse hooks for graphwiki
 */
export async function installHook(): Promise<void> {
  const { generateHooksJsonEntries } = await import('./skill-generator.js');
  const entries = JSON.parse(generateHooksJsonEntries()) as HooksJson;

  // Ensure directory exists
  const hooksDir = dirname(HOOKS_JSON_PATH);
  await mkdir(hooksDir, { recursive: true });

  // Read existing hooks.json or create new
  let existing: HooksJson = { hooks: {} };
  try {
    const content = await readFile(HOOKS_JSON_PATH, 'utf-8');
    existing = JSON.parse(content);
  } catch {
    // File doesn't exist, start fresh
  }

  // Deep merge hooks
  for (const [event, matchers] of Object.entries(entries.hooks)) {
    if (!existing.hooks[event]) {
      existing.hooks[event] = [];
    }
    existing.hooks[event] = deepMergeHooks(existing.hooks[event], matchers);
  }

  // Write merged result
  await writeFile(HOOKS_JSON_PATH, JSON.stringify(existing, null, 2), 'utf-8');
  console.log(`[GraphWiki] Hooks installed to ${HOOKS_JSON_PATH}`);
}

/**
 * Uninstall graphwiki hooks
 */
export async function uninstallHook(): Promise<void> {
  const { generateHooksJsonEntries } = await import('./skill-generator.js');
  const entries = JSON.parse(generateHooksJsonEntries()) as HooksJson;

  try {
    const content = await readFile(HOOKS_JSON_PATH, 'utf-8');
    const existing = JSON.parse(content) as HooksJson;

    // Remove graphwiki hooks by command match
    const graphwikiCommands = [
      'graphwiki-pretool',
      'graphwiki-session-start',
      'graphwiki-posttool',
    ];

    for (const event of Object.keys(existing.hooks)) {
      existing.hooks[event] = existing.hooks[event].map(matcher => ({
        ...matcher,
        hooks: matcher.hooks.filter(h =>
          !graphwikiCommands.some(cmd => h.command?.includes(cmd))
        ),
      })).filter(matcher => matcher.hooks.length > 0);
    }

    await writeFile(HOOKS_JSON_PATH, JSON.stringify(existing, null, 2), 'utf-8');
    console.log(`[GraphWiki] Hooks uninstalled from ${HOOKS_JSON_PATH}`);
  } catch {
    console.log(`[GraphWiki] No hooks.json found at ${HOOKS_JSON_PATH}`);
  }
}

/**
 * Install both skill and hooks
 */
export async function installAll(): Promise<void> {
  const platform = await detectPlatform();
  await installSkill(platform);
  await installHook();
}
