/**
 * External module declarations for tree-sitter grammar packages.
 * These are native addons that don't ship TypeScript declarations.
 * They are marked as external in tsup.config.ts (not bundled).
 */

declare module "tree-sitter-typescript" {
  const TypeScript: any;
  export = TypeScript;
}

declare module "tree-sitter-javascript" {
  const JavaScript: any;
  export = JavaScript;
}

declare module "tree-sitter-python" {
  const Python: any;
  export = Python;
}

declare module "tree-sitter-go" {
  const Go: any;
  export = Go;
}

declare module "tree-sitter-rust" {
  const Rust: any;
  export = Rust;
}

declare module "tree-sitter-java" {
  const Java: any;
  export = Java;
}

declare module "tree-sitter-kotlin" {
  const Kotlin: any;
  export = Kotlin;
}

declare module "tree-sitter-scala" {
  const Scala: any;
  export = Scala;
}

declare module "tree-sitter-c" {
  const C: any;
  export = C;
}

declare module "tree-sitter-cpp" {
  const CPP: any;
  export = CPP;
}

declare module "tree-sitter-c-sharp" {
  const CSharp: any;
  export = CSharp;
}

declare module "tree-sitter-ruby" {
  const Ruby: any;
  export = Ruby;
}

declare module "tree-sitter-php" {
  const PHP: any;
  export = PHP;
}

declare module "tree-sitter-swift" {
  const Swift: any;
  export = Swift;
}

declare module "tree-sitter-lua" {
  const Lua: any;
  export = Lua;
}

declare module "tree-sitter-elixir" {
  const Elixir: any;
  export = Elixir;
}

declare module "tree-sitter-bash" {
  const Bash: any;
  export = Bash;
}
