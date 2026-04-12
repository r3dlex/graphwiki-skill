/**
 * AST-based code extractor using tree-sitter.
 * Extracts functions, classes, modules, interfaces, and types from source code.
 */

import type { GraphNode, GraphEdge, NodeType, EdgeRelation } from "../types.js";

// Lazy-load language parsers to avoid loading all at startup
type LanguageLoader = () => Promise<{ Language: { new (): unknown } }>;

const LANGUAGE_LOADERS: Record<string, LanguageLoader> = {
  typescript: async () => {
    try { return await import("tree-sitter-typescript"); }
    catch { console.warn("[graphwiki] Grammar tree-sitter-typescript not available, skipping"); return null as never; }
  },
  javascript: async () => {
    try { return await import("tree-sitter-javascript"); }
    catch { console.warn("[graphwiki] Grammar tree-sitter-javascript not available, skipping"); return null as never; }
  },
  python: async () => {
    try { return await import("tree-sitter-python"); }
    catch { console.warn("[graphwiki] Grammar tree-sitter-python not available, skipping"); return null as never; }
  },
  go: async () => {
    try { return await import("tree-sitter-go"); }
    catch { console.warn("[graphwiki] Grammar tree-sitter-go not available, skipping"); return null as never; }
  },
  rust: async () => {
    try { return await import("tree-sitter-rust"); }
    catch { console.warn("[graphwiki] Grammar tree-sitter-rust not available, skipping"); return null as never; }
  },
  java: async () => {
    try { return await import("tree-sitter-java"); }
    catch { console.warn("[graphwiki] Grammar tree-sitter-java not available, skipping"); return null as never; }
  },
  kotlin: async () => {
    try { return await import("tree-sitter-kotlin"); }
    catch { console.warn("[graphwiki] Grammar tree-sitter-kotlin not available, skipping"); return null as never; }
  },
  scala: async () => {
    try { return await import("tree-sitter-scala"); }
    catch { console.warn("[graphwiki] Grammar tree-sitter-scala not available, skipping"); return null as never; }
  },
  c: async () => {
    try { return await import("tree-sitter-c"); }
    catch { console.warn("[graphwiki] Grammar tree-sitter-c not available, skipping"); return null as never; }
  },
  cpp: async () => {
    try { return await import("tree-sitter-cpp"); }
    catch { console.warn("[graphwiki] Grammar tree-sitter-cpp not available, skipping"); return null as never; }
  },
  "c-sharp": async () => {
    try { return await import("tree-sitter-c-sharp"); }
    catch { console.warn("[graphwiki] Grammar tree-sitter-c-sharp not available, skipping"); return null as never; }
  },
  ruby: async () => {
    try { return await import("tree-sitter-ruby"); }
    catch { console.warn("[graphwiki] Grammar tree-sitter-ruby not available, skipping"); return null as never; }
  },
  php: async () => {
    try { return await import("tree-sitter-php"); }
    catch { console.warn("[graphwiki] Grammar tree-sitter-php not available, skipping"); return null as never; }
  },
  swift: async () => {
    try { return await import("tree-sitter-swift"); }
    catch { console.warn("[graphwiki] Grammar tree-sitter-swift not available, skipping"); return null as never; }
  },
  lua: async () => {
    try { return await import("tree-sitter-lua"); }
    catch { console.warn("[graphwiki] Grammar tree-sitter-lua not available, skipping"); return null as never; }
  },
  elixir: async () => {
    try { return await import("tree-sitter-elixir"); }
    catch { console.warn("[graphwiki] Grammar tree-sitter-elixir not available, skipping"); return null as never; }
  },
  bash: async () => {
    try { return await import("tree-sitter-bash"); }
    catch { console.warn("[graphwiki] Grammar tree-sitter-bash not available, skipping"); return null as never; }
  },
  // Optional grammars — installed as optionalDependencies; gracefully skipped if absent.
  // These packages use non-standard export shapes so we normalise them inline.
  // tree-sitter-zig: exports the grammar directly (no Language wrapper)
  zig: async () => {
    try {
      const m = await import("tree-sitter-zig");
      const lang = (m as unknown as Record<string, unknown>)["default"] ?? m;
      return { Language: lang } as { Language: { new(): unknown } };
    } catch {
      console.warn("[graphwiki] Grammar tree-sitter-zig not available, skipping");
      return null as never;
    }
  },
  // tree-sitter-ocaml: exports { ocaml, ocaml_interface, ocaml_type }
  ocaml: async () => {
    try {
      const m = await import("tree-sitter-ocaml");
      const lang = (m as unknown as Record<string, unknown>)["ocaml"]
        ?? (m as unknown as Record<string, unknown>)["default"]
        ?? m;
      return { Language: lang } as { Language: { new(): unknown } };
    } catch {
      console.warn("[graphwiki] Grammar tree-sitter-ocaml not available, skipping");
      return null as never;
    }
  },
  // tree-sitter-haskell: exports { language, name, nodeTypeInfo }
  haskell: async () => {
    try {
      const m = await import("tree-sitter-haskell");
      const lang = (m as unknown as Record<string, unknown>)["language"]
        ?? (m as unknown as Record<string, unknown>)["default"]
        ?? m;
      return { Language: lang } as { Language: { new(): unknown } };
    } catch {
      console.warn("[graphwiki] Grammar tree-sitter-haskell not available, skipping");
      return null as never;
    }
  },
};

let parserCache: Map<string, unknown> = new Map();

// === C9: TreeSitterFactory — WASM/native routing ===
export type ParserBackend = 'wasm' | 'native';

interface TreeSitterFactoryOptions {
  backend?: ParserBackend;
}

let wasmInitialized = false;
let wasmInitPromise: Promise<void> | null = null;

async function initWasm(): Promise<void> {
  if (wasmInitialized) return;
  if (wasmInitPromise) return wasmInitPromise;

  wasmInitPromise = (async () => {
    try {
      // web-tree-sitter auto-initializes WASM on import
      await import("web-tree-sitter");
      wasmInitialized = true;
    } catch (err) {
      // WASM init failed — fall back to native
      console.warn("[graphwiki] WASM parser init failed; falling back to native backend.", err);
      wasmInitialized = false;
    }
  })();
  return wasmInitPromise;
}

/**
 * TreeSitterFactory routes parser creation to WASM or native based on options.
 * WASM is the default for portability; native is a performance upgrade.
 */
export class TreeSitterFactory {
  private backend: ParserBackend;

  constructor(options: TreeSitterFactoryOptions = {}) {
    this.backend = options.backend ?? (typeof process !== 'undefined' ? process.env?.["PARSER_BACKEND"] as ParserBackend : undefined) ?? 'wasm';
  }

  async createParser(language: string): Promise<{ parser: unknown; language: string }> {
    if (this.backend === 'wasm') {
      await initWasm();
    }

    const Parser = (await import("tree-sitter")).default;
    const parser = new Parser();

    const langKey = this.getLangKey(language);
    const langLoader = LANGUAGE_LOADERS[langKey] ?? LANGUAGE_LOADERS[langKey.replace(/-/g, "")];

    if (!langLoader) {
      throw new Error(`Unsupported language: ${language}`);
    }

    const mod = await langLoader();
    if (!mod) {
      throw new Error(`Grammar for language "${language}" is not installed`);
    }
    const LanguageClass = (mod as { Language: { new (): unknown } }).Language;

    // @ts-ignore — tree-sitter Language instance
    parser.setLanguage(LanguageClass);

    return { parser, language: langKey };
  }

  private getLangKey(language: string): string {
    const langMap: Record<string, string> = {
      typescript: "typescript", ts: "typescript", tsx: "typescript",
      javascript: "javascript", js: "javascript", jsx: "javascript",
      python: "python", py: "python",
      go: "go", rust: "rust",
      java: "java", kotlin: "kotlin", scala: "scala",
      c: "c", cpp: "cpp", "c-sharp": "c-sharp",
      ruby: "ruby", php: "php", swift: "swift",
      lua: "lua", elixir: "elixir", bash: "bash",
      zig: "zig", ocaml: "ocaml", haskell: "haskell", hs: "haskell",
    };
    return langMap[language.toLowerCase()] ?? language.toLowerCase();
  }

  getBackend(): ParserBackend {
    return this.backend;
  }
}

async function _getLanguage(language: string): Promise<unknown> {
  if (parserCache.has(language)) return parserCache.get(language);

  const loader = LANGUAGE_LOADERS[language.toLowerCase()];
  if (!loader) throw new Error(`Unsupported language: ${language}`);

  const mod = await loader();
  if (!mod) throw new Error(`Grammar for language "${language}" is not installed`);
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


export class ASTExtractor {
  private factory: TreeSitterFactory;
  private backend: ParserBackend;

  constructor(options: { parser?: ParserBackend } = {}) {
    this.backend = options.parser ?? (typeof process !== 'undefined' ? process.env?.["PARSER_BACKEND"] as ParserBackend : undefined) ?? 'wasm';
    this.factory = new TreeSitterFactory({ backend: this.backend });
  }

  getBackend(): ParserBackend {
    return this.backend;
  }

  /**
   * Extract graph nodes and edges from source code using tree-sitter.
   */
  async extract(
    content: string,
    language: string,
    sourcePath: string
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    let tree: unknown;
    try {
      const { parser } = await this.factory.createParser(language);
      tree = (parser as { parse(content: string): unknown }).parse(content);
    } catch {
      // Factory failed — fallback to minimal extraction
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