// Multi-platform skill installer for GraphWiki v2
// Supports: claude, codex, auggie, gemini, cursor, openclaw, opencode, aider, droid, trae, trae-cn, copilot

import { writeFile, mkdir, readFile, access, stat, rm, unlink } from 'fs/promises';
import { join, dirname } from 'path';

export type Platform = 'claude' | 'codex' | 'auggie' | 'gemini' | 'cursor' | 'openclaw' | 'opencode' | 'aider' | 'droid' | 'trae' | 'trae-cn' | 'copilot' | 'antigravity' | 'hermes';

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

  antigravity: {
    name: 'graphwiki',
    description: 'GraphWiki integration for Antigravity',
    prompt: `GraphWiki Knowledge Graph Integration

**Purpose:** Navigate and query the GraphWiki knowledge base

**Commands:**
- graphwiki build . --update    # Incremental rebuild
- graphwiki query "question"   # Ask questions
- graphwiki status             # Show stats
- graphwiki path <nodeA> <nodeB>  # Find path between nodes`,
    tools: [],
  },

  hermes: {
    name: 'graphwiki',
    description: 'GraphWiki integration for Hermes',
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

  // Write/update ## graphwiki section in project CLAUDE.md
  const claudeMdPath = join(process.cwd(), 'CLAUDE.md');
  const section = `\n## graphwiki\n\nGraphWiki knowledge graph is active for this project.\n- Graph: graphwiki-out/graph.json\n- Report: graphwiki-out/GRAPH_REPORT.md\n- Wiki: graphwiki-out/wiki/\n\nWhen invoked via /graphwiki:\n1. Read graphwiki-out/GRAPH_REPORT.md for current graph summary\n2. Run: graphwiki query "<question>" to search the graph\n3. Never modify source files. Use --update for incremental builds.\n\nSee SKILL.md for full protocol.\n`;

  let claudeMdContent = '';
  try {
    claudeMdContent = await readFile(claudeMdPath, 'utf-8');
  } catch {
    // File doesn't exist yet
  }

  const sectionRegex = /\n## graphwiki\n[\s\S]*?(?=\n## |\n# |$)/;
  if (sectionRegex.test(claudeMdContent)) {
    claudeMdContent = claudeMdContent.replace(sectionRegex, section);
  } else {
    claudeMdContent += section;
  }

  await writeFile(claudeMdPath, claudeMdContent, 'utf-8');
  console.log(`[GraphWiki] Updated CLAUDE.md with graphwiki section`);
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

  // Write/merge .codex/hooks.json with PreToolUse hook
  const hooksPath = join(dirname(skillPath), 'hooks.json');
  let hooksJson: { hooks: Record<string, Array<{ command: string }>> } = { hooks: {} };
  try { hooksJson = JSON.parse(await readFile(hooksPath, 'utf-8')); } catch {}
  if (!hooksJson.hooks['PreToolUse']) {
    hooksJson.hooks['PreToolUse'] = [];
  }
  const pretoolCommand = `node ${join(process.cwd(), 'scripts', 'graphwiki-pretool.mjs')}`;
  const alreadyPresent = hooksJson.hooks['PreToolUse'].some(e => e.command === pretoolCommand);
  if (!alreadyPresent) {
    hooksJson.hooks['PreToolUse'].push({ command: pretoolCommand });
  }
  await writeFile(hooksPath, JSON.stringify(hooksJson, null, 2), 'utf-8');
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

  // Append ## graphwiki section to GEMINI.md in project root
  const geminiMdPath = join(process.cwd(), 'GEMINI.md');
  const section = `\n## graphwiki\n\n${skill.prompt}\n`;
  let existing = '';
  try { const raw = await readFile(geminiMdPath, 'utf-8'); if (raw) existing = raw; } catch {}
  if (!existing.includes('## graphwiki')) {
    await writeFile(geminiMdPath, existing + section, 'utf-8');
  }

  // Merge BeforeTool entry in .gemini/settings.json
  const settingsPath = join(dirname(skillPath), 'settings.json');
  let settings: Record<string, unknown> = {};
  try { settings = JSON.parse(await readFile(settingsPath, 'utf-8')); } catch {}
  if (!settings['beforeTool']) {
    settings['beforeTool'] = { command: 'node scripts/graphwiki-pretool.mjs' };
  }
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

/**
 * Installer for Cursor
 */
async function installCursorSkill(skillPath: string): Promise<void> {
  const skill = SKILL_DEFINITIONS.cursor;

  await mkdir(skillPath, { recursive: true });
  const mdcContent = `---
description: GraphWiki knowledge graph skill
alwaysApply: true
---
${skill.prompt}`;
  await writeFile(join(skillPath, 'graphwiki.mdc'), mdcContent, 'utf-8');
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
  if (await dirExists(join(home, '.agent'))) detected.push('antigravity');
  if (await dirExists(join(home, '.hermes'))) detected.push('hermes');

  // Check for antigravity binary
  try {
    await access('/usr/local/bin/antigravity');
    if (!detected.includes('antigravity')) detected.push('antigravity');
  } catch {}

  // Check for hermes binary
  try {
    await access('/usr/local/bin/hermes');
    if (!detected.includes('hermes')) detected.push('hermes');
  } catch {}

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
      const base = installPath ?? join(process.cwd(), '.cursor', 'rules');
      await installCursorSkill(base);
      return join(base, 'graphwiki.mdc');
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

    antigravity: async () => {
      const base = installPath ?? join(process.env.HOME ?? '.', '.agent', 'skills');
      const skill = SKILL_DEFINITIONS.antigravity;
      await mkdir(base, { recursive: true });
      await writeFile(join(base, 'graphwiki.md'), `# ${skill.name}\n\n${skill.description}\n\n${skill.prompt}`, 'utf-8');
      return join(base, 'graphwiki.md');
    },

    hermes: async () => {
      const base = installPath ?? join(process.env.HOME ?? '.', '.hermes', 'skills');
      const skill = SKILL_DEFINITIONS.hermes;
      await mkdir(base, { recursive: true });
      await writeFile(join(base, 'graphwiki.md'), `# ${skill.name}\n\n${skill.description}\n\n${skill.prompt}`, 'utf-8');
      return join(base, 'graphwiki.md');
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

/**
 * Uninstall GraphWiki skill for a specific platform
 */
export async function uninstallSkill(platform: Platform): Promise<void> {
  const home = process.env.HOME ?? '.';

  const fileExists = async (p: string): Promise<boolean> => {
    try { await access(p); return true; } catch { return false; }
  };

  switch (platform) {
    case 'claude': {
      const skillDir = join(home, '.claude', 'skills', 'graphwiki');
      const marker = join(skillDir, '.graphwiki-managed');
      if (!(await fileExists(marker))) {
        console.log(`[GraphWiki] Skipping claude uninstall — no .graphwiki-managed marker found at ${skillDir}`);
        break;
      }
      await rm(skillDir, { recursive: true, force: true });
      console.log(`[GraphWiki] Removed claude skill directory: ${skillDir}`);

      // Remove ## graphwiki section from project CLAUDE.md
      const claudeMdPath = join(process.cwd(), 'CLAUDE.md');
      if (await fileExists(claudeMdPath)) {
        const claudeMdContent = await readFile(claudeMdPath, 'utf-8');
        const sectionRegex = /\n## graphwiki\n[\s\S]*?(?=\n## |\n# |$)/;
        if (sectionRegex.test(claudeMdContent)) {
          await writeFile(claudeMdPath, claudeMdContent.replace(sectionRegex, ''), 'utf-8');
          console.log(`[GraphWiki] Removed graphwiki section from CLAUDE.md`);
        }
      }
      break;
    }

    case 'codex': {
      const skillsDir = join(process.cwd(), '.codex', 'skills');
      const filePath = join(skillsDir, 'graphwiki.md');
      if (await fileExists(filePath)) {
        await unlink(filePath);
        console.log(`[GraphWiki] Removed codex skill: ${filePath}`);
      }
      // Remove graphwiki PreToolUse hook from .codex/hooks.json
      const hooksPath = join(process.cwd(), '.codex', 'hooks.json');
      if (await fileExists(hooksPath)) {
        const hooksJson = JSON.parse(await readFile(hooksPath, 'utf-8')) as { hooks: Record<string, Array<{ command: string }>> };
        if (Array.isArray(hooksJson.hooks['PreToolUse'])) {
          const pretoolCommand = `node ${join(process.cwd(), 'scripts', 'graphwiki-pretool.mjs')}`;
          hooksJson.hooks['PreToolUse'] = hooksJson.hooks['PreToolUse'].filter(e => e.command !== pretoolCommand);
          if (hooksJson.hooks['PreToolUse'].length === 0) {
            delete hooksJson.hooks['PreToolUse'];
          }
          await writeFile(hooksPath, JSON.stringify(hooksJson, null, 2), 'utf-8');
          console.log(`[GraphWiki] Removed graphwiki hook from ${hooksPath}`);
        }
      }
      break;
    }

    case 'gemini': {
      const filePath = join(process.cwd(), '.gemini', 'skills', 'graphwiki-prompt.txt');
      if (await fileExists(filePath)) {
        await unlink(filePath);
        console.log(`[GraphWiki] Removed gemini skill: ${filePath}`);
      }
      // Remove ## graphwiki section from GEMINI.md
      const geminiMdPath = join(process.cwd(), 'GEMINI.md');
      if (await fileExists(geminiMdPath)) {
        const content = await readFile(geminiMdPath, 'utf-8');
        const cleaned = content.replace(/\n## graphwiki\n[\s\S]*?(?=\n## |\s*$)/, '').trimEnd();
        await writeFile(geminiMdPath, cleaned + (cleaned.length ? '\n' : ''), 'utf-8');
        console.log(`[GraphWiki] Removed graphwiki section from ${geminiMdPath}`);
      }
      // Remove beforeTool entry from .gemini/settings.json
      const settingsPath = join(process.cwd(), '.gemini', 'settings.json');
      if (await fileExists(settingsPath)) {
        const settings = JSON.parse(await readFile(settingsPath, 'utf-8')) as Record<string, unknown>;
        const bt = settings['beforeTool'] as Record<string, unknown> | undefined;
        if (bt && bt['command'] === 'node scripts/graphwiki-pretool.mjs') {
          delete settings['beforeTool'];
          await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
          console.log(`[GraphWiki] Removed beforeTool from ${settingsPath}`);
        }
      }
      break;
    }

    case 'cursor': {
      const filePath = join(process.cwd(), '.cursor', 'rules', 'graphwiki.mdc');
      if (await fileExists(filePath)) {
        await unlink(filePath);
        console.log(`[GraphWiki] Removed cursor skill: ${filePath}`);
      }
      break;
    }

    case 'openclaw': {
      const filePath = join(home, '.openclaw', 'skills', 'graphwiki.yaml');
      if (await fileExists(filePath)) {
        await unlink(filePath);
        console.log(`[GraphWiki] Removed openclaw skill: ${filePath}`);
      }
      break;
    }

    case 'opencode':
    case 'aider':
    case 'droid':
    case 'trae':
    case 'trae-cn': {
      // These write an AGENTS.md file — remove the graphwiki section if present,
      // or remove the file entirely if it was fully managed by graphwiki.
      const baseDirs: Record<string, string> = {
        opencode: join(process.cwd(), '.opencode'),
        aider: process.cwd(),
        droid: join(process.cwd(), '.droid'),
        trae: join(process.cwd(), '.trae'),
        'trae-cn': join(process.cwd(), '.trae'),
      };
      const agentsMd = join(baseDirs[platform] ?? process.cwd(), 'AGENTS.md');
      if (await fileExists(agentsMd)) {
        const content = await readFile(agentsMd, 'utf-8');
        // Remove section between <!-- graphwiki-start --> and <!-- graphwiki-end --> if present
        if (content.includes('<!-- graphwiki-start -->')) {
          const cleaned = content.replace(/<!-- graphwiki-start -->[\s\S]*?<!-- graphwiki-end -->\n?/g, '').trim();
          await writeFile(agentsMd, cleaned + (cleaned.length ? '\n' : ''), 'utf-8');
          console.log(`[GraphWiki] Removed graphwiki section from ${agentsMd}`);
        } else {
          // File was written entirely by graphwiki — remove it
          await unlink(agentsMd);
          console.log(`[GraphWiki] Removed ${agentsMd}`);
        }
      }
      break;
    }

    case 'auggie': {
      const skillDir = join(home, '.augment', 'skills', 'graphwiki');
      await rm(skillDir, { recursive: true, force: true });
      console.log(`[GraphWiki] Removed auggie skill directory: ${skillDir}`);

      // Remove graphwiki entries from ~/.augment/settings.json
      const settingsPath = join(home, '.augment', 'settings.json');
      if (await fileExists(settingsPath)) {
        const content = await readFile(settingsPath, 'utf-8');
        const settings = JSON.parse(content) as Record<string, unknown>;
        const graphwikiCommands = [
          'graphwiki-auggie-pretool',
          'graphwiki-auggie-session-start',
          'graphwiki-auggie-posttool',
        ];

        const hookKeys = ['pre_tool_use', 'session_start', 'post_tool_use'] as const;
        for (const key of hookKeys) {
          const hooks = settings[key];
          if (!Array.isArray(hooks)) continue;
          settings[key] = hooks
            .map((entry: Record<string, unknown>) => ({
              ...entry,
              hooks: Array.isArray(entry['hooks'])
                ? (entry['hooks'] as Array<Record<string, unknown>>).filter(
                    (h) => !graphwikiCommands.some(cmd => typeof h['command'] === 'string' && h['command'].includes(cmd))
                  )
                : entry['hooks'],
            }))
            .filter((entry: Record<string, unknown>) =>
              Array.isArray(entry['hooks']) ? (entry['hooks'] as unknown[]).length > 0 : true
            );
        }

        await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
        console.log(`[GraphWiki] Removed graphwiki hooks from ${settingsPath}`);
      }
      break;
    }

    case 'copilot': {
      const skillDir = join(home, '.copilot', 'skills', 'graphwiki');
      await rm(skillDir, { recursive: true, force: true });
      console.log(`[GraphWiki] Removed copilot skill directory: ${skillDir}`);
      break;
    }

    case 'antigravity': {
      const filePath = join(home, '.agent', 'skills', 'graphwiki.md');
      if (await fileExists(filePath)) {
        await unlink(filePath);
        console.log(`[GraphWiki] Removed antigravity skill: ${filePath}`);
      }
      break;
    }

    case 'hermes': {
      const filePath = join(home, '.hermes', 'skills', 'graphwiki.md');
      if (await fileExists(filePath)) {
        await unlink(filePath);
        console.log(`[GraphWiki] Removed hermes skill: ${filePath}`);
      }
      break;
    }

    default:
      console.log(`[GraphWiki] No uninstall handler for platform: ${platform}`);
  }
}
