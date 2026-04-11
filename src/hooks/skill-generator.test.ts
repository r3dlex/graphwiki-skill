import { describe, it, expect, vi } from 'vitest';

vi.mock('process', () => ({
  exit: vi.fn(),
  argv: ['node', 'skill-generator.js', '--check'],
  cwd: vi.fn(() => '/test'),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockRejectedValue(new Error('File not found')),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { parseFrontmatter, parseSections, generateHooksJsonEntries, generate } from './skill-generator.js';

// ============================================================
// Shared fixture
// ============================================================

const FIXTURE_FRONTMATTER = `---
name: graphwiki
version: 2.0.0
description: LLM knowledge graph with persistent wiki compilation
platforms: [claude, codex, auggie, gemini, cursor, openclaw, copilot, windsurf, cody, codewhisperer]
---
`;

const FIXTURE_BODY = `# GraphWiki Skill

Overview text.

## Context Loading Protocol

1. Read graph report
2. Use path queries

## Available Commands

| Command | Description |
|---------|-------------|
| \`graphwiki build .\` | Build the graph |

## Hard Constraints

- NEVER modify raw/
`;

const FIXTURE_CONTENT = FIXTURE_FRONTMATTER + FIXTURE_BODY;

function makeFixture() {
  const frontmatter = parseFrontmatter(FIXTURE_CONTENT);
  const body = FIXTURE_CONTENT.replace(/^---[\s\S]*?---\n/, '');
  const sections = parseSections(body);
  return { frontmatter, sections, rawContent: FIXTURE_CONTENT };
}

// ============================================================
// parseFrontmatter
// ============================================================

describe('parseFrontmatter', () => {
  it('parses valid YAML frontmatter', () => {
    const content = `---
name: GraphWiki
version: 2.0
description: A knowledge graph for code
platforms: [claude, codex, gemini]
---

# Content
`;
    const result = parseFrontmatter(content);
    expect(result.name).toBe('GraphWiki');
    expect(result.version).toBe('2.0');
    expect(result.description).toBe('A knowledge graph for code');
    expect(result.platforms).toEqual(['claude', 'codex', 'gemini']);
  });

  it('throws error for missing frontmatter', () => {
    const content = `# No frontmatter
`;
    expect(() => parseFrontmatter(content)).toThrow('Missing YAML frontmatter');
  });

  it('handles platforms array', () => {
    const content = `---
name: Test
version: 1.0
description: Test desc
platforms: [claude, codex]
---
`;
    const result = parseFrontmatter(content);
    expect(result.platforms).toEqual(['claude', 'codex']);
  });

  it('handles platforms array with spaces', () => {
    const content = `---
name: Test
version: 1.0
description: Test
platforms: [ claude , codex ]
---
`;
    const result = parseFrontmatter(content);
    expect(result.platforms).toEqual(['claude', 'codex']);
  });

  it('handles missing optional fields', () => {
    const content = `---
name: Test
---
`;
    const result = parseFrontmatter(content);
    expect(result.name).toBe('Test');
    expect(result.version).toBe('');
    expect(result.description).toBe('');
    expect(result.platforms).toEqual([]);
  });

  it('handles lines without colon', () => {
    const content = `---
name: Test
version: 1.0
# This is a comment line
description: Test desc
---
`;
    const result = parseFrontmatter(content);
    expect(result.name).toBe('Test');
    expect(result.description).toBe('Test desc');
  });
});

// ============================================================
// parseSections
// ============================================================

describe('parseSections', () => {
  it('parses markdown sections by headings', () => {
    const content = `# Section 1

Content of section 1

## Section 2

Content of section 2
`;
    const result = parseSections(content);
    expect(result.get('Section 1')).toBe('Content of section 1');
    expect(result.get('Section 2')).toBe('Content of section 2');
  });

  it('ignores headings inside code blocks', () => {
    const content = `# Section 1

\`\`\`
# Not a real heading
\`\`\`

## Section 2

Real content
`;
    const result = parseSections(content);
    expect(result.get('Section 1')).toContain('# Not a real heading');
    expect(result.get('Section 2')).toBe('Real content');
  });

  it('handles h3 headings', () => {
    const content = `### H3 Section

H3 content
`;
    const result = parseSections(content);
    expect(result.get('H3 Section')).toBe('H3 content');
  });

  it('handles empty content', () => {
    const result = parseSections('');
    expect(result.size).toBe(0);
  });

  it('handles content without headings', () => {
    const content = `Just some plain text without any headings`;
    const result = parseSections(content);
    expect(result.size).toBe(0);
  });

  it('handles multiple code blocks correctly', () => {
    const content = `# Section

\`\`\`js
const x = 1;
\`\`\`

## Another

\`\`\`ts
const y = 2;
\`\`\`
`;
    const result = parseSections(content);
    expect(result.get('Section')).toBeDefined();
    expect(result.get('Another')).toBeDefined();
  });
});

// ============================================================
// generateHooksJsonEntries
// ============================================================

describe('generateHooksJsonEntries', () => {
  it('returns valid JSON string', () => {
    const result = generateHooksJsonEntries();

    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('PreToolUse');
    expect(parsed).toHaveProperty('SessionStart');
    expect(parsed).toHaveProperty('PostToolUse');
  });

  it('contains graphwiki commands', () => {
    const result = generateHooksJsonEntries();

    expect(result).toContain('graphwiki-pretool');
    expect(result).toContain('graphwiki-session-start');
    expect(result).toContain('graphwiki-posttool');
  });
});

// ============================================================
// generate — golden-output snapshot tests for all 10 platforms
// ============================================================

describe('generate', () => {
  it('claude — returns rawContent verbatim', () => {
    const parsed = makeFixture();
    const result = generate(parsed, 'claude');
    expect(result).toBe(FIXTURE_CONTENT);
  });

  it('codex — abbreviated markdown, no frontmatter, original headings', () => {
    const parsed = makeFixture();
    const result = generate(parsed, 'codex');
    expect(result).toMatchSnapshot();
    expect(result).toContain('# graphwiki - LLM knowledge graph');
    expect(result).not.toMatch(/^---\n/);
    expect(result).toContain('## Context Loading Protocol');
    expect(result).toContain('## Available Commands');
    expect(result).toContain('## Hard Constraints');
  });

  it('copilot — abbreviated markdown, no frontmatter, renamed headings', () => {
    const parsed = makeFixture();
    const result = generate(parsed, 'copilot');
    expect(result).toMatchSnapshot();
    expect(result).toContain('# graphwiki');
    expect(result).not.toMatch(/^---\n/);
    expect(result).toContain('## How to Use');
    expect(result).toContain('## Commands');
    expect(result).toContain('## Rules');
  });

  it('gemini — plain text, UPPER_CASE section names', () => {
    const parsed = makeFixture();
    const result = generate(parsed, 'gemini');
    expect(result).toMatchSnapshot();
    expect(result).toContain('GRAPHWIKI');
    expect(result).toContain('CONTEXT LOADING PROTOCOL');
    expect(result).toContain('COMMANDS');
    expect(result).toContain('HARD CONSTRAINTS');
  });

  it('cursor — JSON format with all fields', () => {
    const parsed = makeFixture();
    const result = generate(parsed, 'cursor');
    expect(result).toMatchSnapshot();
    const obj = JSON.parse(result);
    expect(obj.name).toBe('graphwiki');
    expect(obj.version).toBe('2.0.0');
    expect(obj).toHaveProperty('contextLoadingProtocol');
    expect(obj).toHaveProperty('commands');
    expect(obj).toHaveProperty('hardConstraints');
    expect(obj.platforms).toContain('claude');
  });

  it('openclaw — YAML format with indented blocks', () => {
    const parsed = makeFixture();
    const result = generate(parsed, 'openclaw');
    expect(result).toMatchSnapshot();
    expect(result).toContain('name: graphwiki');
    expect(result).toContain('context_loading_protocol: |');
    expect(result).toContain('commands: |');
    expect(result).toContain('hard_constraints: |');
    expect(result).toContain('platforms: [');
  });

  it('auggie — markdown with YAML frontmatter', () => {
    const parsed = makeFixture();
    const result = generate(parsed, 'auggie');
    expect(result).toMatchSnapshot();
    expect(result).toContain('---\nname: graphwiki');
    expect(result).toContain('## Context Loading Protocol');
    expect(result).toContain('## Available Commands');
    expect(result).toContain('## Hard Constraints');
  });

  it('windsurf — markdown with YAML frontmatter', () => {
    const parsed = makeFixture();
    const result = generate(parsed, 'windsurf');
    expect(result).toMatchSnapshot();
    expect(result).toContain('---\nname: graphwiki');
    expect(result).toContain('## Context Loading Protocol');
  });

  it('cody — markdown with YAML frontmatter', () => {
    const parsed = makeFixture();
    const result = generate(parsed, 'cody');
    expect(result).toMatchSnapshot();
    expect(result).toContain('---\nname: graphwiki');
    expect(result).toContain('## Context Loading Protocol');
  });

  it('codewhisperer — markdown with YAML frontmatter', () => {
    const parsed = makeFixture();
    const result = generate(parsed, 'codewhisperer');
    expect(result).toMatchSnapshot();
    expect(result).toContain('---\nname: graphwiki');
    expect(result).toContain('## Context Loading Protocol');
  });

  it('opencode — markdown with YAML frontmatter', () => {
    const parsed = makeFixture();
    const result = generate(parsed, 'opencode');
    expect(result).toMatchSnapshot();
    expect(result).toContain('---\nname: graphwiki');
    expect(result).toContain('## Context Loading Protocol');
    expect(result).toContain('## Available Commands');
    expect(result).toContain('## Hard Constraints');
  });

  it('aider — markdown with YAML frontmatter', () => {
    const parsed = makeFixture();
    const result = generate(parsed, 'aider');
    expect(result).toMatchSnapshot();
    expect(result).toContain('---\nname: graphwiki');
    expect(result).toContain('## Context Loading Protocol');
  });

  it('droid — markdown with YAML frontmatter', () => {
    const parsed = makeFixture();
    const result = generate(parsed, 'droid');
    expect(result).toMatchSnapshot();
    expect(result).toContain('---\nname: graphwiki');
    expect(result).toContain('## Context Loading Protocol');
  });

  it('trae — markdown with YAML frontmatter', () => {
    const parsed = makeFixture();
    const result = generate(parsed, 'trae');
    expect(result).toMatchSnapshot();
    expect(result).toContain('---\nname: graphwiki');
    expect(result).toContain('## Context Loading Protocol');
  });

  it('trae-cn — same output as trae', () => {
    const parsed = makeFixture();
    const trae = generate(parsed, 'trae');
    const traeCn = generate(parsed, 'trae-cn');
    expect(traeCn).toMatchSnapshot();
    expect(traeCn).toBe(trae);
  });

  it('throws for unknown platform', () => {
    const parsed = makeFixture();
    expect(() => generate(parsed, 'unknown-platform')).toThrow('Unknown platform');
  });
});
