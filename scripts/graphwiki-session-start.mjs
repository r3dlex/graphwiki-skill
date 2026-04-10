#!/usr/bin/env node
/**
 * GraphWiki SessionStart Hook
 * Loads graph status on session start for HUD display.
 *
 * Integration: hooks.json command -> node run.cjs scripts/graphwiki-session-start.mjs
 * run.cjs passes stdin/stdout through unchanged
 * Input (snake_case): { cwd, directory, session_id, sessionId, ... }
 * Output: { continue: true, suppressOutput: true }
 */

import { spawn } from 'child_process';
import { readStdin } from './lib/stdin.mjs';

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
  // Read session-start event from stdin (async with timeout)
  let event;
  try {
    const raw = await readStdin();
    event = JSON.parse(raw.trim());
  } catch {
    // Silent exit on parse failure or timeout
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

  // Write to stdout for OMC bridge to read
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
