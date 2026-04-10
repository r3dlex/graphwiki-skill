/**
 * LLM-based extractor — orchestrates the full extraction pipeline using an LLM provider.
 * Coordinates: dispatcher (rate limiting), validator (schema), cache (persistence), coordinator (state).
 */

import type {
  LLMProvider,
  ExtractionResult,
  GraphDocument,
  Message,
  DispatcherConfig,
} from "../types.js";
import { ExtractionCache } from "./extraction-cache.js";
import { BatchCoordinator } from "./batch-coordinator.js";
import { RateDispatcher } from "./rate-dispatcher.js";
import { validate } from "./schema-validator.js";
import { detectFileType } from "../detect/detector.js";

const DEFAULT_SYSTEM_PROMPT = `You are a code analysis assistant. Given source code, extract a knowledge graph.
Return a JSON object with this exact shape:
{
  "id": "unique-document-id",
  "nodes": [
    {
      "id": "node-id",
      "type": "function | class | module | interface | type | concept | entity | rationale | document | comparison | decision",
      "label": "display label",
      "content": "optional description or docstring",
      "confidence_level": "EXTRACTED | INFERRED | AMBIGUOUS",
      "source": "file path"
    }
  ],
  "edges": [
    {
      "id": "edge-id",
      "source": "node-id",
      "target": "node-id",
      "relation": "calls | imports | uses | defines | implements | extends | overrides | instantiates | semantically_similar_to | related_to | contradicts | supersedes | depends_on | rationale_for | alternative_to",
      "confidence_level": "EXTRACTED | INFERRED | AMBIGUOUS"
    }
  ]
}
Extract all functions, classes, modules, interfaces, and types. Create edges for calls, imports, extends, implements, uses relationships.
Only return valid JSON — no markdown fences, no commentary.`;

const DEFAULT_TIMEOUT_MS = 30_000;

interface LLMExtractorConfig {
  provider: LLMProvider;
  cacheDir?: string;
  dispatcherConfig?: Partial<DispatcherConfig>;
  systemPrompt?: string;
  timeoutMs?: number;
  permissiveMode?: boolean;
}

export class LLMExtractor {
  private readonly provider: LLMProvider;
  private readonly cache: ExtractionCache;
  private readonly coordinator: BatchCoordinator;
  private readonly dispatcher: RateDispatcher;
  private readonly systemPrompt: string;
  private readonly timeoutMs: number;
  private readonly permissiveMode: boolean;

  constructor(config: LLMExtractorConfig) {
    this.provider = config.provider;
    this.cache = new ExtractionCache(config.cacheDir ?? "/tmp/graphwiki-cache");
    this.coordinator = new BatchCoordinator();
    this.dispatcher = new RateDispatcher(
      {
        requests_per_minute: 60,
        burst_limit: 10,
        backoff_base_ms: 500,
        backoff_max_ms: 30_000,
        backoff_multiplier: 2,
        circuit_breaker_threshold: 5,
        circuit_breaker_reset_ms: 60_000,
        retry_attempts: 3,
        ...config.dispatcherConfig,
      },
      config.provider
    );
    this.systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.permissiveMode = config.permissiveMode ?? true;
  }

  /**
   * Extract a graph document from a single file using the LLM.
   */
  async extract(file: Buffer, fileType: string, path: string): Promise<ExtractionResult> {
    const startTime = Date.now();
    const content = file.toString("utf-8");

    // Check cache first
    const contentHash = await this.cache.contentKey(content);
    const cached = await this.cache.get(contentHash);
    if (cached) {
      return { ...cached, cache_hit: true };
    }

    detectFileType(path); // run for side-effects (future: routing decisions)

    // Dispatch LLM call through rate limiter
    let rawResponse: string;
    try {
      rawResponse = await this.dispatcher.dispatch(async () => {
        const messages: Message[] = [
          { role: "system", content: this.systemPrompt },
          {
            role: "user",
            content: `Extract the knowledge graph from this ${fileType} file at "${path}":\n\n${content.slice(0, 8000)}`,
          },
        ];

        const result = await Promise.race([
          this.provider.complete(messages, { max_tokens: 4000 }).then(r => r.content),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error("LLM extraction timed out")), this.timeoutMs)
          ),
        ]);

        return result;
      });
    } catch (err) {
      this.coordinator.markFailed(path, "extraction_error", err instanceof Error ? err.message : String(err));
      throw err;
    }

    // Parse response — strip markdown fences if present
    let parsed: unknown;
    try {
      const cleaned = rawResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      this.coordinator.markFailed(path, "invalid_output", "Failed to parse LLM response as JSON");
      throw new Error("LLM returned non-JSON output");
    }

    // Validate response
    const validation = validate(parsed, this.permissiveMode ? "permissive" : "strict");
    if (!validation.passed) {
      const errors = validation.errors.map(e => `${e.path}: ${e.message}`).join("; ");
      this.coordinator.markFailed(path, "invalid_output", `Validation failed: ${errors}`);
      throw new Error(`Validation errors: ${errors}`);
    }

    // Build result
    const document = parsed as GraphDocument;
    const durationMs = Date.now() - startTime;

    const result: ExtractionResult = {
      document,
      cache_hit: false,
      duration_ms: durationMs,
    };

    // Persist to cache
    await this.cache.set(contentHash, result);
    await this.cache.updateManifest({
      file: path,
      hash: contentHash,
      extractor: "llm",
      timestamp: Date.now(),
      size_bytes: file.byteLength,
      node_count: document.nodes?.length ?? 0,
      edge_count: document.edges?.length ?? 0,
    });

    // Mark complete in coordinator
    this.coordinator.markComplete(path);

    return result;
  }

  /**
   * Extract from multiple files in batch.
   * Returns after all files are processed (errors are tracked in coordinator).
   */
  async extractBatch(files: Array<{ path: string; content: Buffer; type: string }>): Promise<void> {
    const subagentId = 1;
    const filePaths = files.map(f => f.path);
    this.coordinator.assignFiles(filePaths, subagentId);

    await Promise.allSettled(
      files.map(async ({ path, content, type }) => {
        try {
          await this.extract(content, type, path);
        } catch {
          // Errors already recorded by extract()
        }
      })
    );
  }

  /**
   * Get the current batch coordinator state.
   */
  getBatchState() {
    return this.coordinator.getState();
  }
}