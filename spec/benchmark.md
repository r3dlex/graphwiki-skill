# Benchmark

Benchmark command measures extraction and query performance with detailed metrics.

## Usage

```bash
graphwiki benchmark
# Run benchmark on current project

graphwiki benchmark --corpus ./benchmark/corpus
# Benchmark against specific corpus

graphwiki benchmark --compare baseline.json
# Compare against previous results
```

Metrics: extraction (ast/llm/hybrid, nodes/edges/sec), queries (method, tokens, duration). Comparison shows speed and token deltas vs baseline. Output: `graphwiki-out/BENCHMARK_REPORT.json`.
