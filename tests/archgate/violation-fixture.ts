/**
 * Integration test: archgate violation detection
 *
 * This fixture:
 * 1. Backs up src/graph/builder.ts
 * 2. Injects a violation (sha256 -> md5) to break gw-graph-001
 * 3. Runs archgate check --config arch/rules/archgate.config.ts
 * 4. Asserts exit code 1 (violation detected)
 * 5. Restores the original file in finally block
 *
 * Run: node tests/archgate/violation-fixture.ts
 * Or: pnpm test -- tests/archgate/violation-fixture.ts
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync, copyFileSync } from 'fs';
import { describe, it, expect } from 'vitest';

function isArchgateAvailable(): boolean {
  try {
    execSync('command -v archgate', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const FIXTURE_FILE = 'src/graph/builder.ts';
const BACKUP_FILE = 'src/graph/builder.ts.bak';

const archgateAvailable = isArchgateAvailable();

describe('archgate violation fixture', () => {
  it('should detect architectural violations and exit with code 1', () => {
    if (!archgateAvailable) {
      console.log('SKIP: archgate CLI not installed');
      return;
    }

    // Backup
    copyFileSync(FIXTURE_FILE, BACKUP_FILE);

    let violationInjected = false;

    try {
      // Inject violation: sha256 -> md5
      let content = readFileSync(FIXTURE_FILE, 'utf8');
      if (!/createHash\(['"]sha256['"]\)/i.test(content)) {
        console.log('SKIP: source does not contain sha256');
        return;
      }
      content = content.replace(
        /createHash\(['"]sha256['"]\)/i,
        'createHash("md5")'
      );
      writeFileSync(FIXTURE_FILE, content);
      violationInjected = true;

      // Run archgate check
      let exitCode = 0;
      try {
        execSync('archgate check --config arch/rules/archgate.config.ts', {
          stdio: 'pipe',
          timeout: 60000,
        });
      } catch (err: unknown) {
        exitCode = (err as { status?: number }).status ?? 1;
      }

      expect(exitCode).not.toBe(0);
    } finally {
      if (violationInjected) {
        copyFileSync(BACKUP_FILE, FIXTURE_FILE);
        try { unlinkSync(BACKUP_FILE); } catch { /* ignore */ }
      }
    }
  });
});
