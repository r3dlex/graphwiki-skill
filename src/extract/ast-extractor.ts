/**
 * AST-based code extractor using tree-sitter.
 * Extracts functions, classes, modules, interfaces, and types from source code.
 */

import type { GraphNode, GraphEdge, NodeType, EdgeRelation } from "../types.js";

// Lazy-load language parsers to avoid loading all at startup
type LanguageLoader = () => Promise<{ Language: { new (): unknown } }>;

const LANGUAGE_LOADERS: Record<string, LanguageLoader> = {
  typescript: () => import("tree-sitter-typescript"),
  javascript: () => import("tree-sitter-javascript"),
  python: () => import("tree-sitter-python"),
  go: () => import("tree-sitter-go"),
  rust: () => import("tree-sitter-rust"),
  java: () => import("tree-sitter-java"),
  kotlin: () => import("tree-sitter-kotlin"),
  scala: () => import("tree-sitter-scala"),
  c: () => import("tree-sitter-c"),
  cpp: () => import("tree-sitter-cpp"),
  "c-sharp": () => import("tree-sitter-c-sharp"),
  ruby: () => import("tree-sitter-ruby"),
  php: () => import("tree-sitter-php"),
  swift: () => import("tree-sitter-swift"),
  lua: () => import("tree-sitter-lua"),
  elixir: () => import("tree-sitter-elixir"),
  bash: () => import("tree-sitter-bash"),
};

let parserCache: Map<string, unknown> = new Map();

async function _getLanguage(language: string): Promise<unknown> {
  if (parserCache.has(language)) return parserCache.get(language);

  const loader = LANGUAGE_LOADERS[language.toLowerCase()];
  if (!loader) throw new Error(`Unsupported language: ${language}`);

  const mod = await loader();
  parserCache.set(language, mod);
  return mod;
}

// Reference these to avoid unused warnings
void _getLanguage;
void parserCache;

interface ExtractionContext {
  sourcePath: string;
  language: string;
  docId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeIdCounter: number;
}

function nextId(ctx: ExtractionContext): string {
  return `${ctx.docId}-n${ctx.nodeIdCounter++}`;
}

function extractDocstring(node: unknown, language: string): string | undefined {
  // For Python and TypeScript, try to extract docstrings from surrounding comments
  if (language === "python" || language === "typescript") {
    const n = node as Record<string, unknown>;
    return (n["docstring"] as string) ?? (n["documentation"] as string);
  }
  return undefined;
}

function addNode(ctx: ExtractionContext, type: NodeType, label: string, content?: string): string {
  const id = nextId(ctx);
  ctx.nodes.push({
    id,
    type,
    label,
    properties: content ? { content } : undefined,
    provenance: [ctx.sourcePath],
  });
  return id;
}

function addEdge(ctx: ExtractionContext, source: string, target: string, rel: EdgeRelation): void {
  ctx.edges.push({
    id: `${source}-${rel}-${target}`,
    source,
    target,
    weight: 1.0,
    label: rel,
  });
}

// Traverse tree-sitter tree and extract nodes/edges
function traverseTree(tree: unknown, ctx: ExtractionContext): void {
  if (!tree) return;

  const root = tree as Record<string, unknown>;
  visitNode(root, ctx);
}

function visitNode(node: Record<string, unknown>, ctx: ExtractionContext): void {
  const type: string = (node["type"] as string) ?? "";
  const children: unknown[] = (node["children"] as unknown[]) ?? [];

  // Class declarations
  if (type === "class_declaration" || type === "class_definition" || type === "class") {
    const nameNode = findChildByFieldName(node, "name") ?? findChildByFieldName(node, "identifier");
    const name = getNodeText(nameNode) ?? "(anonymous class)";
    const bodyNode = findChildByFieldName(node, "body") ?? findChildByFieldName(node, "declaration");
    const docstring = bodyNode ? extractDocstring(bodyNode, ctx.language) : undefined;

    const classId = addNode(ctx, "class", name, docstring);

    // Process body for methods
    if (bodyNode && typeof bodyNode === "object") {
      const classCtx = { ...ctx };
      (bodyNode as Record<string, unknown>)["_parentId"] = classId;
      traverseBody(bodyNode as Record<string, unknown>, classCtx, classId);
    }

    // Handle superclass (extends)
    const superclass = findChildByFieldName(node, "superclass");
    if (superclass) {
      const superName = getNodeText(superclass);
      if (superName) {
        const superId = addNode(ctx, "class", superName);
        addEdge(ctx, classId, superId, "extends");
      }
    }
  }

  // Function declarations
  if (type === "function_declaration" || type === "function_definition" || type === "function") {
    const nameNode = findChildByFieldName(node, "name") ?? findChildByFieldName(node, "identifier");
    const name = getNodeText(nameNode) ?? "(anonymous function)";
    const bodyNode = findChildByFieldName(node, "body");
    const docstring = bodyNode ? extractDocstring(bodyNode, ctx.language) : undefined;

    const funcId = addNode(ctx, "function", name, docstring);

    // Process function body for calls
    if (bodyNode && typeof bodyNode === "object") {
      extractCallsFromBody(bodyNode as Record<string, unknown>, ctx, funcId);
    }
  }

  // Method definitions (inside class body)
  if (type === "method_definition" || type === "method_declaration") {
    const nameNode = findChildByFieldName(node, "name") ?? findChildByFieldName(node, "identifier");
    const name = getNodeText(nameNode) ?? "(anonymous method)";
    const docstring = extractDocstring(node, ctx.language);

    const methodId = addNode(ctx, "function", name, docstring);

    const parentId = node["_parentId"] as string | undefined;
    if (parentId) {
      addEdge(ctx, parentId, methodId, "defines");
    }

    const bodyNode = findChildByFieldName(node, "body");
    if (bodyNode && typeof bodyNode === "object") {
      extractCallsFromBody(bodyNode as Record<string, unknown>, ctx, methodId);
    }
  }

  // Interface declarations
  if (type === "interface_declaration" || type === "interface") {
    const nameNode = findChildByFieldName(node, "name") ?? findChildByFieldName(node, "identifier");
    const name = getNodeText(nameNode) ?? "(anonymous interface)";

    const ifaceId = addNode(ctx, "interface", name);

    const extendsNode = findChildByFieldName(node, "extends");
    if (extendsNode) {
      const extendsName = getNodeText(extendsNode);
      if (extendsName) {
        const extId = addNode(ctx, "interface", extendsName);
        addEdge(ctx, ifaceId, extId, "extends");
      }
    }
  }

  // Type alias / type definitions
  if (type === "type_alias_declaration" || type === "type_definition" || type === "type") {
    const nameNode = findChildByFieldName(node, "name") ?? findChildByFieldName(node, "identifier");
    const name = getNodeText(nameNode) ?? "(anonymous type)";

    addNode(ctx, "type", name);
  }

  // Import / requires
  if (type === "import_statement" || type === "import" || type === "require") {
    const names = extractImportNames(node);
    for (const imported of names) {
      const importId = addNode(ctx, "module", imported);
      // Link back to current scope (the file module)
      addEdge(ctx, ctx.docId, importId, "imports");
    }
  }

  // Recurse children
  for (const child of children) {
    if (child && typeof child === "object") {
      visitNode(child as Record<string, unknown>, ctx);
    }
  }
}

function traverseBody(node: Record<string, unknown>, ctx: ExtractionContext, parentId: string): void {
  const children: unknown[] = (node["children"] as unknown[]) ?? [];
  for (const child of children) {
    if (child && typeof child === "object") {
      const c = child as Record<string, unknown>;
      (c)["_parentId"] = parentId;
      visitNode(c, ctx);
    }
  }
}

function extractCallsFromBody(bodyNode: Record<string, unknown>, ctx: ExtractionContext, funcId: string): void {
  const children: unknown[] = (bodyNode["children"] as unknown[]) ?? [];
  for (const child of children) {
    if (!child || typeof child !== "object") continue;
    const c = child as Record<string, unknown>;
    const type = (c["type"] as string) ?? "";

    if (type === "call_expression") {
      const funcNode = findChildByFieldName(c, "function") ?? findChildByFieldName(c, "identifier");
      const funcName = getNodeText(funcNode);
      if (funcName && funcName !== "") {
        const targetId = addNode(ctx, "function", funcName);
        addEdge(ctx, funcId, targetId, "calls");
      }
    }

    // Recurse into body
    extractCallsFromBody(c, ctx, funcId);
  }
}

function findChildByFieldName(node: Record<string, unknown>, field: string): Record<string, unknown> | null {
  const children: unknown[] = (node["children"] as unknown[]) ?? [];
  for (const child of children) {
    if (child && typeof child === "object") {
      const c = child as Record<string, unknown>;
      if ((c["fieldName"] as string) === field) return c;
    }
  }
  return null;
}

function getNodeText(node: Record<string, unknown> | null | undefined): string | null {
  if (!node) return null;
  return (node["text"] as string) ?? (node["name"] as string) ?? null;
}

function extractImportNames(node: Record<string, unknown>): string[] {
  const children: unknown[] = (node["children"] as unknown[]) ?? [];
  const names: string[] = [];
  for (const child of children) {
    if (child && typeof child === "object") {
      const text = getNodeText(child as Record<string, unknown>);
      if (text && text !== "import" && text !== "from" && text !== "require" && text !== "(" && text !== ")") {
        names.push(text.replace(/['"]/g, "").split("/").pop() ?? text);
      }
    }
  }
  return names;
}

function getParserForLanguage(language: string): string {
  // Use TypeScript parser for .ts/.tsx, JavaScript for .js/.jsx
  const langMap: Record<string, string> = {
    typescript: "typescript",
    ts: "typescript",
    tsx: "typescript",
    javascript: "javascript",
    js: "javascript",
    jsx: "javascript",
    python: "python",
    py: "python",
    go: "go",
    rust: "rust",
    java: "java",
    kotlin: "kotlin",
    scala: "scala",
    c: "c",
    cpp: "cpp",
    "c-sharp": "c-sharp",
    ruby: "ruby",
    php: "php",
    swift: "swift",
    lua: "lua",
    elixir: "elixir",
    bash: "bash",
  };

  return langMap[language.toLowerCase()] ?? language.toLowerCase();
}

export class ASTExtractor {
  /**
   * Extract graph nodes and edges from source code using tree-sitter.
   */
  async extract(
    content: string,
    language: string,
    sourcePath: string
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const langKey = getParserForLanguage(language);

    const Parser = (await import("tree-sitter")).default;

    const parser = new Parser();

    // Load language
    const langLoader = LANGUAGE_LOADERS[langKey] ?? LANGUAGE_LOADERS[langKey.replace(/-/g, "")];
    if (!langLoader) {
      // Fallback: return minimal extraction with content as rationale
      return {
        nodes: [
          {
            id: `${sourcePath}-module`,
            type: "module",
            label: sourcePath.split("/").pop() ?? sourcePath,
            properties: { content },
            provenance: [sourcePath],
          },
        ],
        edges: [],
      };
    }

    let LanguageClass: unknown;
    try {
      const mod = await langLoader();
      LanguageClass = (mod as { Language: { new (): unknown } }).Language;
    } catch {
      // Language load failed — fallback
      return {
        nodes: [
          {
            id: `${sourcePath}-module`,
            type: "module",
            label: sourcePath.split("/").pop() ?? sourcePath,
            properties: { content },
            provenance: [sourcePath],
          },
        ],
        edges: [],
      };
    }

    try {
      // @ts-ignore — tree-sitter Language instance
      parser.setLanguage(LanguageClass);
    } catch {
      // Language not available — fallback
      return {
        nodes: [
          {
            id: `${sourcePath}-module`,
            type: "module",
            label: sourcePath.split("/").pop() ?? sourcePath,
            properties: { content },
            provenance: [sourcePath],
          },
        ],
        edges: [],
      };
    }

    try {
      const tree = parser.parse(content);
      const docId = sourcePath.replace(/[^a-zA-Z0-9]/g, "_");

      const ctx: ExtractionContext = {
        sourcePath,
        language,
        docId,
        nodes: [],
        edges: [],
        nodeIdCounter: 1,
      };

      // Add module-level node for the file
      const fileLabel = sourcePath.split("/").pop() ?? sourcePath;
      addNode(ctx, "module", fileLabel, content.substring(0, 200));

      traverseTree(tree, ctx);

      return { nodes: ctx.nodes, edges: ctx.edges };
    } catch {
      return {
        nodes: [
          {
            id: `${sourcePath}-module`,
            type: "module",
            label: sourcePath.split("/").pop() ?? sourcePath,
            properties: { content },
            provenance: [sourcePath],
          },
        ],
        edges: [],
      };
    }
  }
}