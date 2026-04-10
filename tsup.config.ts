import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  external: [
    'tree-sitter-typescript',
    'tree-sitter-javascript',
    'tree-sitter-python',
    'tree-sitter-go',
    'tree-sitter-rust',
    'tree-sitter-java',
    'tree-sitter-kotlin',
    'tree-sitter-scala',
    'tree-sitter-c',
    'tree-sitter-cpp',
    'tree-sitter-c-sharp',
    'tree-sitter-ruby',
    'tree-sitter-php',
    'tree-sitter-swift',
    'tree-sitter-lua',
    'tree-sitter-elixir',
    'tree-sitter-bash',
  ],
});
