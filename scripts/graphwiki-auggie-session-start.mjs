#!/usr/bin/env node
/**
 * GraphWiki SessionStart Hook — Auggie variant
 * Loads graph status on session start for HUD display.
 *
 * Integration: ~/.augment/settings.json -> node scripts/graphwiki-auggie-session-start.mjs
 * Auggie events use snake_case: tool_name, tool_input, conversation_id, workspace_roots
 * Input: { cwd, directory, conversation_id, conversationId, ... }
 * Output: { continue: true, suppressOutput: true }
 */

import { spawn } from 'child_process';

const GRAPHWIKI_CLI = process.env.GRAPHWIKI_CLI ?? 'graphwiki';
const PROJECT_ROOT = process.env.GRAPHWIKI_PROJECT_ROOT ?? '.';

function spawnGraphwiki(args, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const proc = spawn(GRAPHWIKI_CLI, args, { cwd: PROJECT_ROOT });
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

async function main() {
  let event;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const raw = chunks.join('');
    event = JSON.parse(raw.trim());
  } catch {
    process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
    return;
  }

  const result = await spawnGraphwiki(['status'], 2000);
  if (result.exitCode !== 0) {
    console.error('[GraphWiki] status check failed:', result.stderr);
    process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
    return;
  }

  const output = result.stdout;
  const nodesMatch = output.match(/Nodes:\s*(\d+)/);
  const edgesMatch = output.match(/Edges:\s*(\d+)/);
  const driftMatch = output.match(/Drift:\s*([\d.]+)/);

  const status = {
    nodes: nodesMatch ? Number(nodesMatch[1]) : 0,
    edges: edgesMatch ? Number(edgesMatch[1]) : 0,
    drift: driftMatch ? driftMatch[1] : '0',
  };

  process.stdout.write(JSON.stringify({
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: `[GraphWiki] Graph: ${status.nodes} nodes, ${status.edges} edges, drift: ${status.drift}`,
    },
  }) + '\n');
}

main();
