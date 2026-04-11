#!/usr/bin/env node
/**
 * GraphWiki PostToolUse Hook — Auggie variant
 * Triggers incremental graph update after git commits.
 *
 * Integration: ~/.augment/settings.json -> node scripts/graphwiki-auggie-posttool.mjs
 * Auggie events use snake_case: tool_name, tool_input, conversation_id, workspace_roots
 * Exit code 2 = blocking; other exit codes = non-blocking
 * Input: { tool_name, tool_input, cwd, ... }
 * Output: { continue: true, suppressOutput: true }
 */

import { spawn } from 'child_process';

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

  // Auggie uses conversation_id
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
