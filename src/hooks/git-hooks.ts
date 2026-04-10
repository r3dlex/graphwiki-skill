// Git hooks for GraphWiki v2
// post-commit and post-checkout hooks

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

/**
 * Generate post-commit hook content
 */
function generatePostCommitHook(): string {
  return `#!/bin/bash
# GraphWiki v2 - post-commit hook
# Automatically updates graph after commits

set -e

# Only run on commit (not merge, rebase, etc.)
if [[ "$GIT_HOOK_COMMAND" != "commit"* ]]; then
  exit 0
fi

# Check if graphwiki is available
if ! command -v graphwiki &> /dev/null; then
  exit 0
fi

# Get list of committed files
COMMITTED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

if [[ -n "$COMMITTED_FILES" ]]; then
  echo "[GraphWiki] Processing committed files..."

  # Run incremental build with updated files
  graphwiki build . --update 2>/dev/null || true

  # Run lint check
  graphwiki lint --fix 2>/dev/null || true

  echo "[GraphWiki] Graph updated successfully"
fi

exit 0
`;
}

/**
 * Generate post-checkout hook content
 */
function generatePostCheckoutHook(): string {
  return `#!/bin/bash
# GraphWiki v2 - post-checkout hook
# Refreshes graph context after checkout

set -e

# Get previous and current branch/commit
PREV_BRANCH="$1"
NEW_BRANCH="$2"

# Check if this is a branch checkout (not file checkout)
if [[ "$PREV_BRANCH" == "0000000000000000000000000000000000000000" ]]; then
  # New branch, skip graph refresh
  exit 0
fi

# Check if graphwiki is available
if ! command -v graphwiki &> /dev/null; then
  exit 0
fi

# Check if wiki directory exists
if [[ ! -d "wiki" ]]; then
  exit 0
fi

echo "[GraphWiki] Refreshing graph context..."

# Reload graph state from wiki
# This ensures new context is available after checkout
graphwiki status > /dev/null 2>&1 || true

echo "[GraphWiki] Graph context refreshed"

exit 0
`;
}

/**
 * Install git hooks
 */
export async function installGitHooks(
  gitDir: string,
  hooksDir: string
): Promise<void> {
  await mkdir(hooksDir, { recursive: true });

  // post-commit hook
  const postCommitPath = join(hooksDir, 'post-commit');
  await writeFile(postCommitPath, generatePostCommitHook(), 'utf-8');
  await makeExecutable(postCommitPath);

  // post-checkout hook
  const postCheckoutPath = join(hooksDir, 'post-checkout');
  await writeFile(postCheckoutPath, generatePostCheckoutHook(), 'utf-8');
  await makeExecutable(postCheckoutPath);

  // Create .githooks reference in git config
  try {
    const { exec } = await import('child_process');
    exec(`cd "${gitDir}" && git config core.hooksPath "${hooksDir}"`, () => {
      // Ignore errors - hook path may already be set
    });
  } catch {}

  console.log('[GraphWiki] Git hooks installed');
  console.log(`  - ${postCommitPath}`);
  console.log(`  - ${postCheckoutPath}`);
}

/**
 * Make file executable
 */
async function makeExecutable(path: string): Promise<void> {
  try {
    const { chmod } = await import('fs/promises');
    await chmod(path, 0o755);
  } catch {}
}

/**
 * Uninstall git hooks
 */
export async function uninstallGitHooks(gitDir: string): Promise<void> {
  try {
    const { exec } = await import('child_process');
    exec(`cd "${gitDir}" && git config --unset core.hooksPath`, () => {});
  } catch {}
}
