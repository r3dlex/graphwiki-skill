// Multi-platform skill installer for GraphWiki v2
// Supports: claude, codex, auggie, gemini, cursor, openclaw, opencode, aider, droid, trae, trae-cn, copilot

import { writeFile, mkdir, readFile, access, stat } from 'fs/promises';
import { join, dirname } from 'path';

export type Platform = 'claude' | 'codex' | 'auggie' | 'gemini' | 'cursor' | 'openclaw' | 'opencode' | 'aider' | 'droid' | 'trae' | 'trae-cn' | 'copilot';

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
  opencode: {
    name: 'graphwiki',
    description: 'GraphWiki integration for OpenCode',
    prompt: `GraphWiki Knowledge Graph Integration\n\nUse graphwiki commands to query and navigate the knowledge base.\n\n- graphwiki build . --update\n- graphwiki query "question"\n- graphwiki path <nodeA> <nodeB>`,
    tools: [],
  },
  aider: {
    name: 'graphwiki',
    description: 'GraphWiki integration for Aider',
    prompt: `GraphWiki Knowledge Graph Integration\n\nUse graphwiki commands to query and navigate the knowledge base.\n\n- graphwiki build . --update\n- graphwiki query "question"\n- graphwiki path <nodeA> <nodeB>`,
    tools: [],
  },
  droid: {
    name: 'graphwiki',
    description: 'GraphWiki integration for Factory Droid',
    prompt: `GraphWiki Knowledge Graph Integration\n\nUse graphwiki commands to query and navigate the knowledge base.\n\n- graphwiki build . --update\n- graphwiki query "question"\n- graphwiki path <nodeA> <nodeB>`,
    tools: [],
  },
  trae: {
    name: 'graphwiki',
    description: 'GraphWiki integration for Trae',
    prompt: `GraphWiki Knowledge Graph Integration\n\nUse graphwiki commands to query and navigate the knowledge base.\n\n- graphwiki build . --update\n- graphwiki query "question"\n- graphwiki path <nodeA> <nodeB>`,
    tools: [],
  },
  'trae-cn': {
    name: 'graphwiki',
    description: 'GraphWiki integration for Trae CN',
    prompt: `GraphWiki Knowledge Graph Integration\n\nUse graphwiki commands to query and navigate the knowledge base.\n\n- graphwiki build . --update\n- graphwiki query "question"\n- graphwiki path <nodeA> <nodeB>`,
    tools: [],
  },
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

  auggie: {
    name: 'graphwiki',
    description: 'GraphWiki integration for Auggie',
    prompt: `GraphWiki Knowledge Graph Integration

**Purpose:** Navigate and query the GraphWiki knowledge base

**Commands:**
- graphwiki build . --update    # Incremental rebuild
- graphwiki query "question"   # Ask questions
- graphwiki status             # Show stats
- graphwiki path <nodeA> <nodeB>  # Find path between nodes

**Protocol:**
1. Check graphwiki-out/GRAPH_REPORT.md first
2. Use graphwiki path for structural navigation
3. Follow wiki page links for context
4. Query results should update wiki/

**Hook Integration:**
GraphWiki hooks into Auggie via ~/.augment/settings.json for automatic context loading before each tool use.`,
    tools: [],
  },

  copilot: {
    name: 'graphwiki',
    description: 'GraphWiki integration for GitHub Copilot',
    prompt: `GraphWiki Knowledge Graph Integration

**Purpose:** Navigate and query the GraphWiki knowledge base

**Commands:**
- graphwiki build . --update    # Incremental rebuild
- graphwiki query "question"   # Ask questions
- graphwiki status             # Show stats
- graphwiki path <nodeA> <nodeB>  # Find path between nodes`,
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
 * Generic AGENTS.md installer (opencode, aider, droid, trae, trae-cn)
 */
async function installAgentsMdSkill(platform: Platform, skillPath: string, extraContent?: string): Promise<void> {
  const skill = SKILL_DEFINITIONS[platform];
  await mkdir(skillPath, { recursive: true });
  const extra = extraContent ? `\n\n${extraContent}` : '';
  await writeFile(
    join(skillPath, 'AGENTS.md'),
    `# ${skill.name}\n\n${skill.description}\n\n${skill.prompt}${extra}`,
    'utf-8'
  );
}

/**
 * Installer for Auggie (YAML frontmatter format)
 */
async function installAuggieSkill(skillPath: string): Promise<void> {
  const skill = SKILL_DEFINITIONS.auggie;

  // Auggie skill goes to ~/.augment/skills/graphwiki/SKILL.md
  const auggieSkillPath = join(skillPath, 'graphwiki');
  await mkdir(auggieSkillPath, { recursive: true });

  const content = `---
name: ${skill.name}
description: ${skill.description}
---

# ${skill.name}

${skill.description}

## Prompt

${skill.prompt}
`;

  await writeFile(join(auggieSkillPath, 'SKILL.md'), content, 'utf-8');
}

/**
 * Install Auggie hooks to ~/.augment/settings.json
 */
async function installAuggieHooks(): Promise<void> {
  const auggieSettingsPath = join(process.env.HOME ?? '.', '.augment', 'settings.json');

  const auggieHooks = {
    pre_tool_use: [{
      matcher: 'launch-process',
      hooks: [{
        type: 'command',
        command: 'node "$GRAPHWIKI_PROJECT_ROOT"/scripts/graphwiki-auggie-pretool.mjs',
      }],
    }],
    session_start: [{
      matcher: 'launch-process',
      hooks: [{
        type: 'command',
        command: 'node "$GRAPHWIKI_PROJECT_ROOT"/scripts/graphwiki-auggie-session-start.mjs',
      }],
    }],
    post_tool_use: [{
      matcher: 'launch-process',
      hooks: [{
        type: 'command',
        command: 'node "$GRAPHWIKI_PROJECT_ROOT"/scripts/graphwiki-auggie-posttool.mjs',
      }],
    }],
  };

  // Read existing settings or create new
  let existing: Record<string, unknown> = {};
  try {
    const content = await readFile(auggieSettingsPath, 'utf-8');
    existing = JSON.parse(content);
  } catch {
    // File doesn't exist, start fresh
  }

  // Merge auggie hooks
  existing = { ...existing, ...auggieHooks };

  await mkdir(dirname(auggieSettingsPath), { recursive: true });
  await writeFile(auggieSettingsPath, JSON.stringify(existing, null, 2), 'utf-8');
  console.log(`[GraphWiki] Auggie hooks installed to ${auggieSettingsPath}`);
}

/**
 * Detect all installed AI platforms
 */
export async function detectPlatforms(): Promise<Platform[]> {
  const home = process.env.HOME ?? '';
  const detected: Platform[] = [];

  const fileExists = async (p: string): Promise<boolean> => {
    try { await access(p); return true; } catch { return false; }
  };
  const dirExists = async (p: string): Promise<boolean> => {
    try { const s = await stat(p); return s.isDirectory(); } catch { return false; }
  };

  if (await fileExists(join(home, '.claude', 'settings.json'))) detected.push('claude');
  if (await fileExists(join(home, '.cursor', 'settings.json'))) detected.push('cursor');
  if (await dirExists(join(home, '.augment'))) detected.push('auggie');
  if (await dirExists(join(home, '.codex'))) detected.push('codex');
  if (await dirExists(join(home, '.gemini'))) detected.push('gemini');
  if (await dirExists(join(home, '.openclaw'))) detected.push('openclaw');
  if (await dirExists(join(home, '.opencode'))) detected.push('opencode');
  if (await dirExists(join(home, '.copilot'))) detected.push('copilot' as Platform);
  if (await dirExists(join(home, '.droid'))) detected.push('droid');
  if (await dirExists(join(home, '.trae'))) detected.push('trae');

  // Aider: check for .aider.conf.yml or .aider* files in cwd
  try {
    await access(join(process.cwd(), '.aider.conf.yml'));
    detected.push('aider');
  } catch {
    // Also check for any .aider* file via stat
    try {
      await access(join(process.cwd(), '.aider'));
      detected.push('aider');
    } catch {}
  }

  return detected;
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

    auggie: async () => {
      const base = join(process.env.HOME ?? '.', '.augment', 'skills');
      await installAuggieSkill(base);
      await installAuggieHooks();
      return join(base, 'graphwiki');
    },

    opencode: async () => {
      const base = installPath ?? join(process.cwd(), '.opencode');
      // OpenCode: AGENTS.md + tool.execute.before hook in .opencode/config.json
      await installAgentsMdSkill('opencode', base);
      const configPath = join(base, 'config.json');
      let config: Record<string, unknown> = {};
      try { config = JSON.parse(await readFile(configPath, 'utf-8')); } catch {}
      const hook = { command: 'node "$GRAPHWIKI_PROJECT_ROOT"/scripts/graphwiki-pretool.mjs' };
      const existing = (config['tool'] as Record<string, unknown> | undefined) ?? {};
      config['tool'] = { ...existing, execute: { before: hook } };
      await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      return join(base, 'AGENTS.md');
    },

    aider: async () => {
      const base = installPath ?? process.cwd();
      await installAgentsMdSkill('aider', base);
      return join(base, 'AGENTS.md');
    },

    droid: async () => {
      const base = installPath ?? join(process.cwd(), '.droid');
      // Factory Droid: AGENTS.md + Task tool entry
      await installAgentsMdSkill('droid', base, '## Task Tool\n\nGraphWiki is available as a task tool via `graphwiki` CLI commands.');
      return join(base, 'AGENTS.md');
    },

    trae: async () => {
      const base = installPath ?? join(process.cwd(), '.trae');
      await installAgentsMdSkill('trae', base);
      return join(base, 'AGENTS.md');
    },

    'trae-cn': async () => {
      const base = installPath ?? join(process.cwd(), '.trae');
      await installAgentsMdSkill('trae-cn', base);
      return join(base, 'AGENTS.md');
    },

    copilot: async () => {
      const base = installPath ?? join(process.env.HOME ?? '.', '.copilot');
      await installAgentsMdSkill('copilot', base);
      return join(base, 'AGENTS.md');
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
  JSON.parse(generateHooksJsonEntries()) as HooksJson;

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
      const cleaned = existing.hooks[event as keyof typeof existing.hooks]?.map(matcher => ({
        ...matcher,
        hooks: matcher.hooks.filter(h =>
          !graphwikiCommands.some(cmd => h.command?.includes(cmd))
        ),
      })).filter(matcher => matcher.hooks.length > 0);
      if (cleaned !== undefined) {
        existing.hooks[event as keyof typeof existing.hooks] = cleaned;
      }
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
