import matter from "gray-matter";

/**
 * Parse frontmatter from a string.
 * Returns { data: parsed YAML frontmatter object, content: rest of string }.
 */
export function readFrontmatter(content: string): { data: Record<string, unknown>; content: string } {
  const parsed = matter(content);
  return { data: parsed.data as Record<string, unknown>, content: parsed.content };
}

/**
 * Serialize frontmatter and content back to a string.
 * Adds --- delimiters around the YAML block.
 */
export function writeFrontmatter(content: string, data: Record<string, unknown>): string {
  return matter.stringify(content, data);
}