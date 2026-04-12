#!/usr/bin/env node
// GraphWiki postinstall script — runs after npm install
// Skips auto-install in non-interactive (CI/pipe) environments
import { detectPlatforms, installSkill } from './hooks/skill-installer.js';

async function runPostInstall(): Promise<void> {
  // Skip if non-interactive (CI, Docker, piped output)
  if (!process.stdout.isTTY) {
    console.log('[GraphWiki] Non-interactive environment detected, skipping skill auto-install. Run "graphwiki skill install" manually.');
    return;
  }
  // Skip if explicitly disabled
  if (process.env.GRAPHWIKI_SKIP_POSTINSTALL) {
    console.log('[GraphWiki] GRAPHWIKI_SKIP_POSTINSTALL set, skipping skill auto-install.');
    return;
  }
  try {
    const platforms = await detectPlatforms();
    if (platforms.length === 0) {
      console.log('[GraphWiki] No supported AI platforms detected. Run "graphwiki skill install" to install manually.');
      return;
    }
    for (const platform of platforms) {
      console.log(`[GraphWiki] Detected ${platform}, installing skill...`);
      await installSkill(platform);
      console.log(`[GraphWiki] Skill installed for ${platform}`);
    }
  } catch (err) {
    // Never fail postinstall — just warn
    console.warn('[GraphWiki] Skill auto-install failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

runPostInstall().catch(() => process.exit(0));
