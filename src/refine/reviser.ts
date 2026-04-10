// Prompt reviser for GraphWiki v2
// Uses LLM to revise prompts based on diagnostics

import type { WeakNodeDiagnostic, LLMProvider } from '../types.js';
import { writeFile, mkdir, readdir, readFile } from 'fs/promises';
import { join } from 'path';

const MAX_DIFF_LENGTH = 200; // Maximum character difference for minimal-change constraint
const PROMPTS_DIR = '.graphwiki/prompts';

/**
 * Prompt reviser
 *
 * Uses LLM to revise extraction prompts based on diagnostics.
 * Enforces minimal-change constraint (max 200 chars diff).
 * Maintains prompt versioning.
 */
export class Reviser {
  private provider: LLMProvider;
  private promptsDir: string;
  private currentVersion: string;

  constructor(provider: LLMProvider, promptsDir = PROMPTS_DIR, currentVersion = 'v1') {
    this.provider = provider;
    this.promptsDir = promptsDir;
    this.currentVersion = currentVersion;
  }

  /**
   * Revise a prompt based on diagnostic
   */
  async revise(
    prompt: string,
    diagnostic: WeakNodeDiagnostic,
    query: string
  ): Promise<string> {
    // Build revision prompt
    const revisionPrompt = this.buildRevisionPrompt(prompt, diagnostic, query);

    // Call LLM to generate revision
    const result = await this.provider.complete(
      [
        {
          role: 'user',
          content: revisionPrompt,
        },
      ],
      {
        max_tokens: 500,
        temperature: 0.3, // Low temperature for deterministic revisions
      }
    );

    // Extract revised prompt from response
    let revisedPrompt = this.extractRevisedPrompt(result.content, prompt);

    // Apply minimal-change constraint
    revisedPrompt = this.applyMinimalChangeConstraint(revisedPrompt, prompt);

    return revisedPrompt;
  }

  /**
   * Build prompt for LLM revision
   */
  private buildRevisionPrompt(
    currentPrompt: string,
    diagnostic: WeakNodeDiagnostic,
    query: string
  ): string {
    return `You are a prompt engineering expert. Revise the extraction prompt below to fix the identified issues.

CURRENT PROMPT:
${currentPrompt}

QUERY CONTEXT:
${query}

DIAGNOSIS:
- Node: ${diagnostic.nodeLabel} (${diagnostic.nodeId})
- Failure Modes: ${diagnostic.failureModes.join(', ')}
- Suggested Improvements: ${diagnostic.suggestedPrompts.join('; ')}

INSTRUCTIONS:
1. Address the failure modes identified above
2. Keep the revision focused and minimal
3. Maximum 200 characters changed from original
4. Return ONLY the revised prompt text, no explanation

REVISED PROMPT:`;
  }

  /**
   * Extract revised prompt from LLM response
   */
  private extractRevisedPrompt(content: string, originalPrompt: string): string {
    // Look for markdown code blocks
    const codeBlockMatch = content.match(/```[\w]*\n?([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Look for "REVISED PROMPT:" marker
    const markerMatch = content.match(/REVISED PROMPT:\s*([\s\S]*?)(?:\n\n|$)/i);
    if (markerMatch) {
      return markerMatch[1].trim();
    }

    // Fallback: use content that seems most like a prompt
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    if (lines.length > 0) {
      // Take first substantial line or paragraph
      const prompt = lines.slice(0, 5).join(' ').trim();
      if (prompt.length > 10) {
        return prompt;
      }
    }

    return originalPrompt;
  }

  /**
   * Apply minimal-change constraint
   */
  private applyMinimalChangeConstraint(revised: string, original: string): string {
    // Calculate diff length (simple character-based)
    const diff = this.calculateDiff(revised, original);

    if (diff <= MAX_DIFF_LENGTH) {
      return revised;
    }

    // If diff is too large, apply only critical changes
    // Find the most important suggested prompt changes
    return this.applyCriticalChanges(revised, original);
  }

  /**
   * Calculate difference between two strings
   */
  private calculateDiff(str1: string, str2: string): number {
    // Simple Levenshtein-like distance
    const len1 = str1.length;
    const len2 = str2.length;
    const max = Math.max(len1, len2);

    if (max === 0) return 0;

    // Quick check: if lengths differ by more than max, return max
    if (Math.abs(len1 - len2) > MAX_DIFF_LENGTH) {
      return MAX_DIFF_LENGTH + 1;
    }

    // Count matching characters from start
    let matching = 0;
    const minLen = Math.min(len1, len2);
    for (let i = 0; i < minLen; i++) {
      if (str1[i] === str2[i]) {
        matching++;
      } else {
        break;
      }
    }

    // Estimate diff
    return Math.abs(len1 - len2) + (minLen - matching);
  }

  /**
   * Apply only critical changes when diff exceeds limit
   */
  private applyCriticalChanges(revised: string, original: string): string {
    // For now, just return original with a note
    // In a real implementation, this would apply targeted changes
    console.warn('Prompt diff exceeds 200 chars, using original with critical fixes only');

    // Try to merge key improvements
    let result = original;

    // Extract key phrases from revised that might be improvements
    const improvements = revised.match(/[A-Z][^.!?]*[.!?]/g) || [];

    if (improvements.length > 0) {
      // Append first improvement as a note
      result = original.trim() + '\n\nNote: ' + improvements[0];
    }

    return result;
  }

  /**
   * Save revised prompt with version
   */
  async savePromptVersion(
    promptName: string,
    content: string,
    version?: string
  ): Promise<string> {
    const ver = version ?? this.nextVersion();
    const filename = `${promptName}.${ver}.md`;
    const filepath = join(this.promptsDir, filename);

    await mkdir(this.promptsDir, { recursive: true });
    await writeFile(filepath, content, 'utf-8');

    this.currentVersion = ver;
    return ver;
  }

  /**
   * Get next version string
   */
  private nextVersion(): string {
    const match = this.currentVersion.match(/v(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10) + 1;
      return `v${num}`;
    }
    return 'v2';
  }

  /**
   * Load prompt by name and version
   */
  async loadPrompt(promptName: string, version?: string): Promise<string | null> {
    const ver = version ?? this.currentVersion;
    const filename = `${promptName}.${ver}.md`;
    const filepath = join(this.promptsDir, filename);

    try {
      return await readFile(filepath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * List available prompt versions
   */
  async listPromptVersions(promptName: string): Promise<string[]> {
    try {
      const files = await readdir(this.promptsDir);
      const prefix = `${promptName}.`;
      const suffix = '.md';

      return files
        .filter(f => f.startsWith(prefix) && f.endsWith(suffix))
        .map(f => f.slice(prefix.length, -suffix.length));
    } catch {
      return [];
    }
  }

  /**
   * Get current version
   */
  getCurrentVersion(): string {
    return this.currentVersion;
  }
}

/**
 * Create reviser instance
 */
export function createReviser(provider: LLMProvider): Reviser {
  return new Reviser(provider);
}
