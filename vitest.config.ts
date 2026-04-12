import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'src/**/*.test.ts',
        'src/types.ts',
        'src/index.ts',
        'src/**/types.ts',
        'src/**/*.d.ts',
        'src/cli.ts',
        'src/serve/**',
        'src/util/math.ts',
        'src/wiki/types.ts',
        'src/report/types.ts',
        'src/extract/video-ingester.ts',
        'src/extract/tree-sitter-compare.ts',
        'arch/**',
        'lib/**',
        'scripts/**',
        'tests/**',
        'dist/**',
        'node_modules/**',
        '.claude/**',
        '**/*.d.ts',
        'vitest.config.ts',
        'tsup.config.ts',
        'eslint.config.js',
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80
      }
    },
    mockReset: true,
    clearMocks: true
  }
});
