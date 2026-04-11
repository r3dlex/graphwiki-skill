import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface IgnoreSources {
  configJson: string[];
  graphwikiignore: string[];
  graphifyignore: string[];
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
 * Resolve ignore patterns from all three sources:
 * 1. .graphwiki/config.json  -- extracts extraction.ignore_patterns
 * 2. .graphwikiignore        -- newline-separated patterns
 * 3. .graphifyignore         -- newline-separated patterns
 *
 * Returns [patterns, sources] where patterns is deduplicated and
 * sources holds the per-source breakdown for diagnostics.
 */
export async function resolveIgnores(
  projectRoot: string
): Promise<[patterns: string[], sources: Readonly<IgnoreSources>]> {
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

  const allPatterns = [...configPatterns, ...wikiignore, ...graphifyignore];
  const deduped = Array.from(new Set(allPatterns));

  return [deduped, sources];
}
