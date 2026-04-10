#!/usr/bin/env node
/**
 * GraphWiki PreToolUse Hook
 * Full implementation -- replaces stubs in src/hooks/pre-tool-use.ts
 *
 * Integration: hooks.json command -> node run.cjs scripts/graphwiki-pretool.mjs
 * run.cjs passes stdin/stdout through unchanged (stdio: 'inherit')
 * Input (snake_case, verified from OMC source):
 *   { tool_name, tool_input, cwd, directory, session_id, sessionId, hook_event_name, ... }
 * Output (JSON on stdout):
 *   { continue: true, suppressOutput: true }
 *   -- OR --
 *   { continue: true, hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: "..." } }
 */

import { spawn } from 'child_process';
import { readStdin } from '../lib/stdin.mjs';

const GRAPHWIKI_CLI = process.env.GRAPHWIKI_CLI ?? 'graphwiki';
const PROJECT_ROOT = process.env.GRAPHWIKI_PROJECT_ROOT ?? '.';

// ── Token Budget ───────────────────────────────────────────────────────────────

const MAX_TOKENS = Number(process.env.GRAPHWIKI_TOKEN_BUDGET_MAX ?? 150000);
const WARN_THRESHOLD = Number(process.env.GRAPHWIKI_WARN_THRESHOLD ?? 0.8);

let totalTokensUsed = 0;

function trackTokens(tokens) {
  totalTokensUsed += tokens;
  if (totalTokensUsed > MAX_TOKENS * WARN_THRESHOLD) {
    console.error(`[GraphWiki] Token budget warning: ${totalTokensUsed}/${MAX_TOKENS} (${Math.round(totalTokensUsed / MAX_TOKENS * 100)}%)`);
  }
}

// ── CLI Invocation ────────────────────────────────────────────────────────────

/**
 * Spawn graphwiki CLI with timeout.
 * @param {string[]} args - CLI arguments
 * @param {number} timeoutMs
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
 */
function spawnGraphwiki(args, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const proc = spawn(GRAPHWIKI_CLI, args, {
      cwd: PROJECT_ROOT,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? 0 }));
    proc.on('error', (err) => resolve({ stdout: '', stderr: err.message, exitCode: 1 }));
    setTimeout(() => {
      try { proc.kill(); } catch {}
      resolve({ stdout, stderr, exitCode: 124 });
    }, timeoutMs);
  });
}

// ── Graph Queries ─────────────────────────────────────────────────────────────

/**
 * Load graph context for given terms via graphwiki path (0 tokens).
 * Calls: graphwiki path <term1> <term2>
 */
async function loadGraphContext(terms) {
  if (!terms || terms.length < 2) return { nodes: [], edges: [], output: '' };

  const queryTerms = terms.slice(0, 3);
  const result = await spawnGraphwiki(['path', ...queryTerms], 2000);

  if (result.exitCode !== 0) {
    return { nodes: [], edges: [], output: '' };
  }

  const output = result.stdout.trim();
  const nodes = [];
  const edges = [];

  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('Node:')) {
      nodes.push(trimmed.slice(5).trim());
    } else if (trimmed.startsWith('Edge:')) {
      edges.push(trimmed.slice(5).trim());
    }
  }

  return { nodes, edges, output };
}

/**
 * Find relevant wiki pages for a query via graphwiki query.
 * Calls: graphwiki query "<question>"
 */
async function findRelevantNodes(question) {
  if (!question || question.trim().length < 3) {
    return { pages: [], content: '', tokens: 0 };
  }

  const truncated = question.slice(0, 200);
  const result = await spawnGraphwiki(['query', truncated], 3000);

  if (result.exitCode !== 0) {
    return { pages: [], content: '', tokens: 0 };
  }

  const content = result.stdout.trim();
  const tokens = Math.ceil(content.length / 4);
  trackTokens(tokens);

  const pages = [];
  for (const line of content.split('\n')) {
    const match = line.match(/\[([^\]]+\.md)\]/);
    if (match) pages.push(match[1]);
  }

  return { pages: [...new Set(pages)], content, tokens };
}

// ── Tool Routing ──────────────────────────────────────────────────────────────

function getQueryStrategy(toolName) {
  const name = (toolName || '').toLowerCase();
  if (['read', 'grep', 'glob'].includes(name)) return 'path';
  if (['ask', 'query', 'search'].includes(name)) return 'query';
  return 'none';
}

/**
 * Extract search terms from Read/Grep/Glob tool input.
 * Works with snake_case field names.
 */
function extractPathTerms(input) {
  if (!input) return [];
  if (typeof input === 'string') {
    const terms = [];
    const camel = input.match(/[A-Z][a-z]+(?:[A-Z][a-z]+)+/g);
    if (camel) terms.push(...camel);
    const pathSeg = input.match(/(?:src|lib|components|services|utils)\/([^\s]+)/g);
    if (pathSeg) terms.push(...pathSeg.map(p => p.split('/').pop()));
    return [...new Set(terms)].slice(0, 5);
  }
  if (typeof input === 'object') {
    const parts = [];
    if (input.file_path) parts.push(input.file_path);
    if (input.path) parts.push(input.path);
    if (input.pattern) parts.push(input.pattern);
    if (input.query) parts.push(input.query);
    return extractPathTerms(parts.join(' '));
  }
  return [];
}

/**
 * Extract query terms from Ask/Query tool input.
 */
function extractQueryTerms(input) {
  if (!input) return '';
  if (typeof input === 'string') return input.slice(0, 200);
  if (typeof input === 'object') {
    return (input.prompt || input.question || input.text || '').slice(0, 200);
  }
  return String(input).slice(0, 200);
}

// ── Output ────────────────────────────────────────────────────────────────────

/**
 * Write JSON response to stdout for OMC bridge to read.
 * suppressOutput: true means no user-visible output from the hook
 * additionalContext: passed to the agent as extra context
 */
function writeOutput(context) {
  const output = {
    continue: true,
    suppressOutput: true,
  };
  if (context && (context.nodes?.length || context.pages?.length || context.content)) {
    output.hookSpecificOutput = {
      hookEventName: 'PreToolUse',
      additionalContext: formatContext(context),
    };
  }
  process.stdout.write(JSON.stringify(output) + '\n');
}

function formatContext(ctx) {
  const parts = [];
  if (ctx.nodes?.length) {
    parts.push(`Graph nodes: ${ctx.nodes.join(', ')}`);
  }
  if (ctx.edges?.length) {
    parts.push(`Graph edges: ${ctx.edges.join(', ')}`);
  }
  if (ctx.pages?.length) {
    parts.push(`Wiki pages: ${ctx.pages.join(', ')}`);
  }
  if (ctx.content && ctx.tokens !== undefined) {
    parts.push(`[GraphWiki: ${ctx.tokens} tokens loaded from knowledge graph]`);
  }
  return parts.join('\n');
}

// ── Main Handler ──────────────────────────────────────────────────────────────

async function main() {
  let event;
  try {
    // Async stdin with timeout (standard OMC pattern)
    const raw = await readStdin();
    event = JSON.parse(raw.trim());
  } catch {
    // Silent exit on parse failure or timeout
    process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
    return;
  }

  // Parse snake_case fields (primary) with camelCase fallback
  // Verified from OMC bridge-normalize.ts and pre-tool-enforcer.mjs
  const toolName = event.tool_name ?? event.toolName ?? '';
  const toolInput = event.tool_input ?? event.toolInput ?? {};
  const directory = event.cwd ?? event.directory ?? process.cwd();
  const sessionId = event.session_id ?? event.sessionId ?? '';

  const strategy = getQueryStrategy(toolName);
  if (strategy === 'none') {
    writeOutput(null);
    return;
  }

  let context = { nodes: [], edges: [], pages: [], content: '', tokens: 0 };

  try {
    if (strategy === 'path') {
      const terms = extractPathTerms(toolInput);
      if (terms.length >= 2) {
        const result = await loadGraphContext(terms);
        context.nodes = result.nodes;
        context.edges = result.edges;
      }
    } else if (strategy === 'query') {
      const question = extractQueryTerms(toolInput);
      if (question) {
        const queryResult = await findRelevantNodes(question);
        context.pages = queryResult.pages;
        context.content = queryResult.content;
        context.tokens = queryResult.tokens;
      }
    }
  } catch (err) {
    // Graceful degradation -- log but don't crash
    console.error(`[GraphWiki] Hook error: ${err.message}`);
  }

  writeOutput(context);
}

main();
