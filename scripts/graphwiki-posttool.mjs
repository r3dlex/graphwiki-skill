#!/usr/bin/env node
/**
 * GraphWiki PostToolUse Hook
 * Triggers incremental graph update after git commits.
 *
 * Integration: hooks.json command -> node run.cjs scripts/graphwiki-posttool.mjs
 * run.cjs passes stdin/stdout through unchanged
 * Input (snake_case): { tool_name, tool_input, cwd, ... }
 * Output: { continue: true, suppressOutput: true }
 */

import { spawn } from 'child_process';
import { readStdin } from './lib/stdin.mjs';

const GRAPHWIKI_CLI = process.env.GRAPHWIKI_CLI ?? 'graphwiki';
const PROJECT_ROOT = process.env.GRAPHWIKI_PROJECT_ROOT ?? '.';

function spawnGraphwiki(args, timeoutMs = 5000) {
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
  // Read post-tool-use event from stdin (async with timeout)
  let event;
  try {
    const raw = await readStdin();
    event = JSON.parse(raw.trim());
  } catch {
    process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
    return;
  }

  // Parse snake_case fields
  const toolName = event.tool_name ?? event.toolName ?? '';
  const toolInput = event.tool_input ?? event.toolInput ?? {};

  // Only trigger on Bash tool with git commit
  if (toolName.toLowerCase() !== 'bash') {
    process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
    return;
  }

  const cmd = typeof toolInput === 'string' ? toolInput : (toolInput.command || '');
  const isGitCommit = /\bgit\s+commit\b/.test(cmd);

  if (!isGitCommit) {
    process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
    return;
  }

  console.error('[GraphWiki] Git commit detected, running incremental build...');
  const result = await spawnGraphwiki(['build', '.', '--update'], 5000);

  if (result.exitCode === 0) {
    console.error('[GraphWiki] Graph updated successfully');
  } else {
    console.error('[GraphWiki] Graph update failed:', result.stderr);
  }

  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
}

main();
