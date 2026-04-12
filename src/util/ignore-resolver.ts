import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Semantic distinction between the two ignore files:
 *
 * .graphwikiignore  → EXTRACTION-TIME filter
 *   Files matching these patterns are never read or processed. The extractor
 *   skips them entirely — they produce no nodes or edges and consume no tokens.
 *   Use this for files that are irrelevant to the knowledge graph (build
 *   artifacts, vendored code, large binaries, etc.).
 *
 * .graphifyignore   → OUTPUT-TIME filter
 *   Files matching these patterns ARE read and extracted, but their resulting
 *   nodes and edges are excluded from the final graph.json output. Use this
 *   when you want the LLM to see a file for context during extraction (e.g.,
 *   shared type definitions) but you do not want those nodes to appear in the
 *   published graph.
 *
 * .graphwiki/config.json (extraction.ignore_patterns) behaves like
 * .graphwikiignore — patterns are applied at extraction time.
 */

export interface IgnoreSources {
  configJson: string[];
  graphwikiignore: string[];
  graphifyignore: string[];
}

/**
 * Split ignore sets returned by resolveIgnoresSplit().
 */
export interface SplitIgnores {
  /** Patterns from .graphwiki/config.json + .graphwikiignore — skip at extraction time. */
  extractionIgnores: string[];
  /** Patterns from .graphifyignore — exclude from final graph output. */
  outputIgnores: string[];
  sources: Readonly<IgnoreSources>;
}

/**
 * Read an ignore file, strip comments and blank lines.
 * Returns [] on error (missing file or parse failure).
 */
async function readIgnoreFile(path: string): Promise<string[]> {
  try {
    const content = await readFile(path, "utf-8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
  } catch {
    return [];
  }
}

/**
 * Resolve ignore patterns from all three sources and return them split by
 * semantic meaning:
 *
 * - extractionIgnores: from .graphwiki/config.json + .graphwikiignore
 *   → files are not read at all during extraction
 * - outputIgnores: from .graphifyignore
 *   → files are extracted but nodes are excluded from the final graph output
 */
export async function resolveIgnoresSplit(
  projectRoot: string
): Promise<SplitIgnores> {
  const [configRaw, wikiignore, graphifyignore] = await Promise.all([
    readFile(join(projectRoot, ".graphwiki", "config.json"), "utf-8").catch(
      () => ""
    ),
    readIgnoreFile(join(projectRoot, ".graphwikiignore")),
    readIgnoreFile(join(projectRoot, ".graphifyignore")),
  ]);

  let configPatterns: string[] = [];
  if (configRaw) {
    try {
      const parsed = JSON.parse(configRaw);
      if (Array.isArray(parsed?.extraction?.ignore_patterns)) {
        configPatterns = parsed.extraction.ignore_patterns;
      }
    } catch {
      // Malformed JSON -- treat as empty (graceful degradation)
    }
  }

  const sources: IgnoreSources = {
    configJson: configPatterns,
    graphwikiignore: wikiignore,
    graphifyignore: graphifyignore,
  };

  const extractionIgnores = Array.from(new Set([...configPatterns, ...wikiignore]));
  const outputIgnores = Array.from(new Set(graphifyignore));

  return { extractionIgnores, outputIgnores, sources };
}

/**
 * Resolve ignore patterns from all three sources:
 * 1. .graphwiki/config.json  -- extracts extraction.ignore_patterns
 * 2. .graphwikiignore        -- newline-separated patterns
 * 3. .graphifyignore         -- newline-separated patterns
 *
 * Returns [patterns, sources] where patterns is deduplicated and
 * sources holds the per-source breakdown for diagnostics.
 *
 * Note: this merges all patterns into a single list for backward compatibility.
 * For semantically correct split behaviour, use resolveIgnoresSplit() instead.
 */
export async function resolveIgnores(
  projectRoot: string
): Promise<[patterns: string[], sources: Readonly<IgnoreSources>]> {
  const { extractionIgnores, outputIgnores, sources } = await resolveIgnoresSplit(projectRoot);

  const allPatterns = [...extractionIgnores, ...outputIgnores];
  const deduped = Array.from(new Set(allPatterns));

  return [deduped, sources];
}
