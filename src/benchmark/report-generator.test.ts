import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReportGenerator, createReportGenerator } from './report-generator.js';
import { readFile, rm, mkdir } from 'fs/promises';
import { join } from 'path';

const TEST_DIR = '/tmp/graphwiki-test-report';

describe('ReportGenerator', () => {
  let generator: ReportGenerator;

  beforeEach(async () => {
    generator = new ReportGenerator(TEST_DIR);
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(TEST_DIR, { recursive: true, force: true });
    } catch {}
  });

  describe('generate', () => {
    it('should generate report from results', () => {
      const results: import('../types.js').BenchmarkRun[] = [
        {
          method: 'grep',
          query: 'test',
          tokens_consumed: 1000,
          files_accessed: 10,
          answer: 'answer',
          duration_ms: 100,
        },
        {
          method: 'graphwiki',
          query: 'test',
          tokens_consumed: 500,
          files_accessed: 3,
          answer: 'answer',
          duration_ms: 150,
        },
      ];

      const report = generator.generate(results);

      expect(report.generated_at).toBeDefined();
      expect(report.runs).toHaveLength(2);
      expect(report.total_tokens).toBe(1500);
      expect(report.avg_tokens_per_query).toBe(750);
      expect(report.winner).toBe('graphwiki');
    });

    it('should handle empty results', () => {
      const report = generator.generate([]);

      expect(report.total_tokens).toBe(0);
      expect(report.avg_tokens_per_query).toBe(0);
      expect(report.winner).toBe('none');
    });
  });

  describe('computeBreakEven', () => {
    it('should compute break-even point', () => {
      const results: import('../types.js').BenchmarkRun[] = [
        {
          method: 'grep',
          query: 'test',
          tokens_consumed: 1000,
          files_accessed: 10,
          answer: 'answer',
          duration_ms: 100,
        },
        {
          method: 'graphwiki',
          query: 'test',
          tokens_consumed: 200,
          files_accessed: 3,
          answer: 'answer',
          duration_ms: 150,
        },
      ];

      const breakEven = generator.computeBreakEven(50000, results);

      // buildCost=50000, baseline=1000, graphwiki=200
      // savingsPerQuery = 1000 - 200 = 800
      // breakEven = 50000 / 800 = 62.5 -> 63
      expect(breakEven).toBe(63);
    });

    it('should return Infinity if graphwiki is more expensive', () => {
      const results: import('../types.js').BenchmarkRun[] = [
        {
          method: 'grep',
          query: 'test',
          tokens_consumed: 100,
          files_accessed: 10,
          answer: 'answer',
          duration_ms: 100,
        },
        {
          method: 'graphwiki',
          query: 'test',
          tokens_consumed: 500,
          files_accessed: 3,
          answer: 'answer',
          duration_ms: 150,
        },
      ];

      const breakEven = generator.computeBreakEven(50000, results);
      expect(breakEven).toBe(Infinity);
    });

    it('should return Infinity if no matching methods', () => {
      const results: import('../types.js').BenchmarkRun[] = [
        {
          method: 'rag',
          query: 'test',
          tokens_consumed: 500,
          files_accessed: 5,
          answer: 'answer',
          duration_ms: 100,
        },
      ];

      const breakEven = generator.computeBreakEven(50000, results);
      expect(breakEven).toBe(Infinity);
    });
  });

  describe('formatResultsTable', () => {
    it('should format results as ASCII table', () => {
      const results: import('../types.js').BenchmarkRun[] = [
        {
          method: 'grep',
          query: 'test',
          tokens_consumed: 1000,
          files_accessed: 10,
          answer: 'answer',
          duration_ms: 100,
          precision: 0.8,
          recall: 0.7,
        },
        {
          method: 'graphwiki',
          query: 'test',
          tokens_consumed: 500,
          files_accessed: 3,
          answer: 'answer',
          duration_ms: 150,
          precision: 0.95,
          recall: 0.9,
        },
      ];

      const table = generator.formatResultsTable(results);

      expect(table).toContain('grep');
      expect(table).toContain('graphwiki');
      expect(table).toContain('1000');
      expect(table).toContain('500');
      expect(table).toContain('Total tokens');
    });

    it('should handle empty results', () => {
      const table = generator.formatResultsTable([]);
      expect(table).toContain('No results');
    });
  });

  describe('saveReport', () => {
    it('should save report to file', async () => {
      const report: import('../types.js').BenchmarkReport = {
        generated_at: '2024-01-01T00:00:00Z',
        runs: [],
        total_tokens: 0,
        avg_tokens_per_query: 0,
        winner: 'none',
      };

      await generator.saveReport(report, 'test-report.json');

      const content = await readFile(join(TEST_DIR, 'test-report.json'), 'utf-8');
      const saved = JSON.parse(content);
      expect(saved.generated_at).toBe('2024-01-01T00:00:00Z');
    });
  });

  describe('generateAndSave', () => {
    it('should generate and save both JSON and TXT', async () => {
      const results: import('../types.js').BenchmarkRun[] = [
        {
          method: 'grep',
          query: 'test',
          tokens_consumed: 1000,
          files_accessed: 10,
          answer: 'answer',
          duration_ms: 100,
        },
      ];

      await generator.generateAndSave(results);

      const jsonPath = join(TEST_DIR, 'baseline-comparison.json');
      const txtPath = join(TEST_DIR, 'baseline-comparison.txt');

      const jsonContent = await readFile(jsonPath, 'utf-8');
      const txtContent = await readFile(txtPath, 'utf-8');

      expect(JSON.parse(jsonContent)).toBeDefined();
      expect(txtContent).toContain('grep');
    });
  });

  describe('printSummary', () => {
    it('should print summary without throwing', () => {
      const report: import('../types.js').BenchmarkReport = {
        generated_at: '2024-01-01T00:00:00Z',
        runs: [
          {
            method: 'grep',
            query: 'test',
            tokens_consumed: 1000,
            files_accessed: 10,
            answer: 'answer',
            duration_ms: 100,
          },
        ],
        total_tokens: 1000,
        avg_tokens_per_query: 1000,
        winner: 'grep',
      };

      expect(() => generator.printSummary(report)).not.toThrow();
    });
  });

  describe('createReportGenerator', () => {
    it('should create generator with default output dir', () => {
      const gen = createReportGenerator();
      expect(gen).toBeInstanceOf(ReportGenerator);
    });
  });
});
