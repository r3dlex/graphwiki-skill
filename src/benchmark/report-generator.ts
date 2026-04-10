// Report generator for benchmark results in GraphWiki v2

import type { BenchmarkRun, BenchmarkReport } from '../types.js';
import { writeFile, mkdir } from 'fs/promises';

/**
 * ReportGenerator - Generates benchmark comparison reports
 */
export class ReportGenerator {
  private outputDir: string;

  constructor(outputDir = 'graphwiki-out/benchmarks') {
    this.outputDir = outputDir;
  }

  /**
   * Generate benchmark report from multiple runs
   */
  generate(results: BenchmarkRun[]): BenchmarkReport {
    const totalTokens = results.reduce((sum, r) => sum + r.tokens_consumed, 0);
    const avgTokensPerQuery = results.length > 0 ? totalTokens / results.length : 0;

    // Determine winner based on tokens consumed (lower is better)
    const sortedByTokens = [...results].sort((a, b) => a.tokens_consumed - b.tokens_consumed);
    const winner = sortedByTokens[0]?.method ?? 'none';

    return {
      generated_at: new Date().toISOString(),
      runs: results,
      total_tokens: totalTokens,
      avg_tokens_per_query: avgTokensPerQuery,
      winner,
    };
  }

  /**
   * Compute break-even point between two methods
   * @param buildCost - Token cost to build the graph
   * @param results - Benchmark runs comparing methods
   * @returns Query number at which GraphWiki becomes cheaper
   */
  computeBreakEven(buildCost: number, results: BenchmarkRun[]): number {
    const graphwikiResult = results.find(r => r.method === 'graphwiki');
    const baselineResult = results.find(r => r.method === 'grep' || r.method === 'naive');

    if (!graphwikiResult || !baselineResult) {
      return Infinity;
    }

    const baselineTokensPerQuery = baselineResult.tokens_consumed;
    const graphwikiTokensPerQuery = graphwikiResult.tokens_consumed;

    // Break-even: buildCost + (n * graphwikiTokens) = n * baselineTokens
    // n = buildCost / (baselineTokens - graphwikiTokens)
    const savingsPerQuery = baselineTokensPerQuery - graphwikiTokensPerQuery;

    if (savingsPerQuery <= 0) {
      return Infinity; // Never breaks even
    }

    return Math.ceil(buildCost / savingsPerQuery);
  }

  /**
   * Format results as ASCII table
   */
  formatTable(): string {
    // This is a placeholder - actual implementation would format data
    return '';
  }

  /**
   * Format results as ASCII table with proper columns
   */
  formatResultsTable(results: BenchmarkRun[]): string {
    if (results.length === 0) {
      return 'No results to display.\n';
    }

    const methods = results.map(r => r.method);
    const maxMethodLen = Math.max(...methods.map(m => m.length), 10);

    const headers = ['Method', 'Tokens', 'Files', 'Duration', 'Precision', 'Recall'];
    const widths = [maxMethodLen, 10, 8, 12, 10, 10];

    const headerRow = headers.map((h, i) => h.padEnd(widths[i] ?? 10)).join(' | ');
    const divider = widths.map(w => '-'.repeat(w ?? 10)).join('-+-');

    const rows = results.map(r => {
      const method = r.method.padEnd(maxMethodLen);
      const tokens = String(r.tokens_consumed).padEnd(10);
      const files = String(r.files_accessed).padEnd(8);
      const duration = `${r.duration_ms}ms`.padEnd(12);
      const precision = r.precision ? r.precision.toFixed(2).padEnd(10) : 'N/A'.padEnd(10);
      const recall = r.recall ? r.recall.toFixed(2).padEnd(10) : 'N/A'.padEnd(10);
      return [method, tokens, files, duration, precision, recall].join(' | ');
    });

    return [
      headerRow,
      divider,
      ...rows,
      '',
      `Total tokens: ${results.reduce((s, r) => s + r.tokens_consumed, 0)}`,
      `Avg tokens/query: ${(results.reduce((s, r) => s + r.tokens_consumed, 0) / results.length).toFixed(2)}`,
    ].join('\n');
  }

  /**
   * Save report to file
   */
  async saveReport(report: BenchmarkReport, filename = 'baseline-comparison.json'): Promise<void> {
    await mkdir(this.outputDir, { recursive: true });
    const filepath = `${this.outputDir}/${filename}`;
    await writeFile(filepath, JSON.stringify(report, null, 2));
  }

  /**
   * Generate and save a complete report
   */
  async generateAndSave(results: BenchmarkRun[], _buildCost = 50000): Promise<BenchmarkReport> {
    const report = this.generate(results);

    await this.saveReport(report);

    // Also save ASCII table
    const table = this.formatResultsTable(results);
    await mkdir(this.outputDir, { recursive: true });
    await writeFile(`${this.outputDir}/baseline-comparison.txt`, table);

    return report;
  }

  /**
   * Print summary to console
   */
  printSummary(report: BenchmarkReport): void {
    console.log('\n=== Benchmark Results ===');
    console.log(`Generated: ${report.generated_at}`);
    console.log(`Total queries: ${report.runs.length}`);
    console.log(`Total tokens: ${report.total_tokens}`);
    console.log(`Avg tokens/query: ${report.avg_tokens_per_query.toFixed(2)}`);
    console.log(`Winner (lowest tokens): ${report.winner}`);
    console.log('\n--- Per-Method Summary ---');

    const byMethod = new Map<string, { count: number; totalTokens: number; avgTokens: number }>();
    for (const run of report.runs) {
      const existing = byMethod.get(run.method) ?? { count: 0, totalTokens: 0, avgTokens: 0 };
      existing.count++;
      existing.totalTokens += run.tokens_consumed;
      existing.avgTokens = existing.totalTokens / existing.count;
      byMethod.set(run.method, existing);
    }

    for (const [method, stats] of byMethod) {
      console.log(`  ${method}: avg=${stats.avgTokens.toFixed(2)} tokens/query (${stats.count} runs)`);
    }
  }
}

/**
 * Create default report generator
 */
export function createReportGenerator(): ReportGenerator {
  return new ReportGenerator();
}
