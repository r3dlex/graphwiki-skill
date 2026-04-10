/**
 * GraphWiki v2 — Public API
 * Re-exports all public-facing interfaces and implementations.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type {
  GraphNode,
  GraphEdge,
  Hyperedge,
  CommunityMeta,
  GraphDocument,
  NodeType,
  EdgeRelation,
  ConfidenceLevel,
  ManifestEntry,
  ExtractionConfig,
  ExtractionResult,
  ValidationError,
  ValidationResult,
  Coercion,
  FailedFile,
  SkippedFile,
  BatchState,
  SubagentState,
  DispatcherConfig,
  DispatcherState,
  ThroughputMetrics,
  DriftLogEntry,
  CompilationBudget,
  MergeResult,
  DeduplicationConfig,
  BenchmarkRun,
  CorpusSpec,
  LLMProvider,
  Tokenizer,
  Message,
  // Legacy / extended types
  CompletionOptions,
  CompletionResult,
  MessageRole,
  WeakNodeDiagnostic,
  QueryScore,
  RefinementHistoryEntry,
  MCPToolDefinition,
  MCPRequest,
  MCPResponse,
  MCPTransport,
  ToolContext,
  CLIOptions,
  LockFile,
} from "./types.js";

// ─── Detection ─────────────────────────────────────────────────────────────

export { detectFileType, detectLanguage } from "./detect/detector.js";
export { SUPPORTED_LANGUAGES, EXTRACTOR_PATH } from "./detect/detector.js";

// ─── Utilities ───────────────────────────────────────────────────────────────

export { sha256, xxhash, contentHash } from "./util/hash.js";
export { readFrontmatter, writeFrontmatter } from "./util/frontmatter.js";
export { estimateTokens, estimateMessagesTokens } from "./util/token-estimator.js";

// ─── Extraction ──────────────────────────────────────────────────────────────

export { ExtractionCache } from "./extract/extraction-cache.js";
export { validate } from "./extract/schema-validator.js";
export type { SchemaValidationResult } from "./extract/schema-validator.js";
export { GRAPH_WIKI_TOOLS } from "./serve/tools.js";
export type { GraphWikiTools, ToolExecutor } from "./serve/tools.js";
export { COERCION_RULES } from "./extract/schema-validator.js";
export { BatchCoordinator } from "./extract/batch-coordinator.js";
export { RateDispatcher } from "./extract/rate-dispatcher.js";
export { ASTExtractor } from "./extract/ast-extractor.js";
export { LLMExtractor } from "./extract/llm-extractor.js";