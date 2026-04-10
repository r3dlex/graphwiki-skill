/**
 * File type and language detection utilities.
 */

import * as path from "node:path";

// ─── Supported Languages Map ─────────────────────────────────────────────────

export const SUPPORTED_LANGUAGES: Record<string, string> = {
  // JavaScript / TypeScript
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  // Python
  ".py": "Python",
  ".pyi": "Python",
  // Go
  ".go": "Go",
  // Rust
  ".rs": "Rust",
  // Java / Kotlin / Scala
  ".java": "Java",
  ".kt": "Kotlin",
  ".kts": "Kotlin",
  ".scala": "Scala",
  // C / C++
  ".c": "C",
  ".h": "C",
  ".cpp": "C++",
  ".cc": "C++",
  ".cxx": "C++",
  ".hpp": "C++",
  ".hxx": "C++",
  // C#
  ".cs": "C#",
  // Ruby
  ".rb": "Ruby",
  // PHP
  ".php": "PHP",
  // Swift
  ".swift": "Swift",
  // Lua
  ".lua": "Lua",
  // Elixir
  ".ex": "Elixir",
  ".exs": "Elixir",
  // Shell
  ".sh": "Bash",
  ".bash": "Bash",
  ".zsh": "Bash",
  ".fish": "Bash",
};

// ─── Extractor Path Map ─────────────────────────────────────────────────────

export const EXTRACTOR_PATH: Record<string, "ast" | "frontmatter" | "model_native"> = {
  // Source code — use AST extractor
  ".ts": "ast",
  ".tsx": "ast",
  ".js": "ast",
  ".jsx": "ast",
  ".mjs": "ast",
  ".cjs": "ast",
  ".py": "ast",
  ".pyi": "ast",
  ".go": "ast",
  ".rs": "ast",
  ".java": "ast",
  ".kt": "ast",
  ".kts": "ast",
  ".scala": "ast",
  ".c": "ast",
  ".h": "ast",
  ".cpp": "ast",
  ".cc": "ast",
  ".cxx": "ast",
  ".hpp": "ast",
  ".hxx": "ast",
  ".cs": "ast",
  ".rb": "ast",
  ".php": "ast",
  ".swift": "ast",
  ".lua": "ast",
  ".ex": "ast",
  ".exs": "ast",
  ".sh": "ast",
  ".bash": "ast",
  ".zsh": "ast",
  ".fish": "ast",
  // Markdown — use frontmatter extractor
  ".md": "frontmatter",
  ".mdx": "frontmatter",
  ".markdown": "frontmatter",
  // Model-native formats
  ".pdf": "model_native",
  ".docx": "model_native",
  ".pptx": "model_native",
  ".rtf": "model_native",
  ".png": "model_native",
  ".jpg": "model_native",
  ".jpeg": "model_native",
  ".gif": "model_native",
  ".webp": "model_native",
};

/**
 * Detect the type of a file based on its path.
 */
export function detectFileType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();

  // Binary / document formats
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx") return "docx";
  if (ext === ".pptx") return "pptx";
  if (ext === ".rtf") return "rtf";
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"].includes(ext)) {
    return "image";
  }
  if ([".md", ".mdx", ".markdown"].includes(ext)) return "markdown";
  if (SUPPORTED_LANGUAGES[ext]) return "code";
  if ([".txt", ".text", ".log", ".json", ".jsonl", ".yaml", ".yml", ".toml", ".xml", ".html", ".css"].includes(ext)) {
    return "code";
  }

  return "unsupported";
}

/**
 * Detect the programming language of a source file from its extension.
 * Returns the language name or null if unknown.
 */
export function detectLanguage(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_LANGUAGES[ext] ?? null;
}