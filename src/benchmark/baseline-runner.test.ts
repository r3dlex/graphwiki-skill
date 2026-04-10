import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaselineRunner, createCorpusSpec } from './baseline-runner.js';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';

const TEST_DIR = '/tmp/graphwiki-test-baseline';

describe('BaselineRunner', () => {
  let runner: BaselineRunner;
  const mockTokenCounter = {
    count: vi.fn((text: string) => Math.ceil(text.length / 4)),
    countMessages: vi.fn((messages: { role: string; content: string }[]) =>
      messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0)
    ),
    record: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    runner = new BaselineRunner(mockTokenCounter);

    // Create test files
    await mkdir(join(TEST_DIR, 'src'), { recursive: true });
    await writeFile(join(TEST_DIR, 'src', 'file1.ts'), 'function hello() { return "world"; }');
    await writeFile(join(TEST_DIR, 'src', 'file2.ts'), 'const foo = "bar"; // hello world');
    await writeFile(join(TEST_DIR, 'src', 'file3.ts'), 'export class Test { }');
  });

  afterEach(async () => {
    try {
      await rm(TEST_DIR, { recursive: true, force: true });
    } catch {}
  });

  describe('runGrepAssisted', () => {
    it('should run grep-assisted query', async () => {
      const corpus = {
        files: [join(TEST_DIR, 'src', 'file1.ts'), join(TEST_DIR, 'src', 'file2.ts')],
        size_bytes: 100,
      };

      const result = await runner.runGrepAssisted('hello world', corpus);

      expect(result.method).toBe('grep');
      expect(result.query).toBe('hello world');
      expect(result.tokens_consumed).toBeGreaterThan(0);
      expect(result.files_accessed).toBeGreaterThanOrEqual(0);
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should find matching files', async () => {
      const corpus = {
        files: [join(TEST_DIR, 'src', 'file1.ts'), join(TEST_DIR, 'src', 'file2.ts')],
        size_bytes: 100,
      };

      const result = await runner.runGrepAssisted('hello', corpus);

      expect(result.files_accessed).toBeGreaterThan(0);
    });
  });

  describe('runNaive', () => {
    it('should run naive query', async () => {
      const corpus = {
        files: [join(TEST_DIR, 'src', 'file1.ts'), join(TEST_DIR, 'src', 'file2.ts')],
        size_bytes: 100,
      };

      const result = await runner.runNaive('hello', corpus);

      expect(result.method).toBe('naive');
      expect(result.query).toBe('hello');
      expect(result.tokens_consumed).toBeGreaterThan(0);
      expect(result.files_accessed).toBe(corpus.files.length);
    });
  });

  describe('runRAG', () => {
    it('should run RAG query', async () => {
      const corpus = {
        files: [join(TEST_DIR, 'src', 'file1.ts')],
        size_bytes: 100,
      };

      const result = await runner.runRAG('what is the function?', corpus);

      expect(result.method).toBe('rag');
      expect(result.tokens_consumed).toBeGreaterThan(0);
      expect(result.precision).toBeDefined();
      expect(result.recall).toBeDefined();
    });
  });

  describe('runGraphWiki', () => {
    it('should run GraphWiki query', async () => {
      const corpus = {
        files: [join(TEST_DIR, 'src', 'file1.ts')],
        size_bytes: 100,
      };

      const result = await runner.runGraphWiki('what is exported?', corpus);

      expect(result.method).toBe('graphwiki');
      expect(result.tokens_consumed).toBeGreaterThan(0);
      expect(result.precision).toBeDefined();
      expect(result.recall).toBeDefined();
    });
  });

  describe('runAll', () => {
    it('should run all methods', async () => {
      const corpus = {
        files: [join(TEST_DIR, 'src', 'file1.ts')],
        size_bytes: 100,
      };

      const results = await runner.runAll('test query', corpus);

      expect(results.length).toBe(4);
      expect(results.map(r => r.method)).toEqual(['grep', 'naive', 'rag', 'graphwiki']);
    });
  });
});

describe('createCorpusSpec', () => {
  beforeEach(async () => {
    await mkdir(join(TEST_DIR, 'src'), { recursive: true });
    await writeFile(join(TEST_DIR, 'src', 'file1.ts'), 'function hello() { }');
    await writeFile(join(TEST_DIR, 'src', 'file2.ts'), 'const foo = "bar";');
  });

  afterEach(async () => {
    try {
      await rm(TEST_DIR, { recursive: true, force: true });
    } catch {}
  });

  it('should create corpus spec from directory', async () => {
    const spec = await createCorpusSpec(join(TEST_DIR, 'src'), '**/*.ts');

    expect(spec.files.length).toBeGreaterThan(0);
    expect(spec.size_bytes).toBeGreaterThan(0);
    expect(spec.language).toBe('typescript');
  });

  it('should handle unknown language', async () => {
    await writeFile(join(TEST_DIR, 'unknown.xyz'), 'some content');
    const spec = await createCorpusSpec(TEST_DIR, '**/*.xyz');

    expect(spec.language).toBe('unknown');
  });
});
