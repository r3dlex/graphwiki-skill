// GraphWiki v2 — Core Type Definitions
// Imported by all modules

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  properties?: Record<string, unknown>;
  provenance?: string[];
  source_file?: string;
  community?: number;
  embedding?: number[];
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
  label?: string;
  provenance?: string[];
}

export interface GraphDocument {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata?: {
    completeness?: number;
    source?: string;
    generated_at?: string;
    [key: string]: unknown;
  };
}

export interface MergeResult {
  merged_id: string;
  absorbed_ids: string[];
  provenance_combined: string[];
  edge_redirects: number;
}

export interface DeduplicationConfig {
  merge_threshold: number;
  max_candidates?: number;
  context_boost_threshold?: number;
  compatible_types?: string[][];
}

export interface DriftLogEntry {
  timestamp: string;
  drifted_nodes: string[];
  new_communities: Map<string, number>;
  affected_by_change: Set<string>;
}

export interface GraphDelta {
  added: { nodes: GraphNode[]; edges: GraphEdge[] };
  removed: { nodes: GraphNode[]; edges: GraphEdge[] };
  modified: GraphNode[];
  unchanged: string[];
}

// === Message types for LLM providers ===

export type MessageRole = 'user' | 'assistant' | 'system' | 'developer';

export interface Message {
  role: MessageRole;
  content: string;
  name?: string;
}

export interface CompletionOptions {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  system?: string;
}

export interface CompletionResult {
  content: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  model?: string;
  stop_reason?: string;
}

// === LLM Provider interface ===

export interface LLMProvider {
  complete(messages: Message[], options: CompletionOptions): Promise<CompletionResult>;
  supportedDocumentFormats(): string[];
  supportedImageFormats(): string[];
  maxDocumentPages(): number;
  maxImageResolution(): number;
  extractFromDocument(content: Buffer, format: string, prompt: string): Promise<string>;
  extractFromImage(content: Buffer, prompt: string): Promise<string>;
}

// === Corpus and Benchmark types ===

export interface CorpusSpec {
  files: string[];
  size_bytes: number;
  language?: string;
}

export interface BenchmarkRun {
  method: 'grep' | 'naive' | 'rag' | 'graphwiki';
  query: string;
  tokens_consumed: number;
  files_accessed: number;
  answer: string;
  duration_ms: number;
  precision?: number;
  recall?: number;
}

export interface BenchmarkReport {
  generated_at: string;
  runs: BenchmarkRun[];
  total_tokens: number;
  avg_tokens_per_query: number;
  winner: string;
}

// === Refinement types ===

export interface TraceResult {
  query: string;
  forwardPath: {
    wikiPagesLoaded: string[];
    graphNodesTraversed: string[];
    tierReached: number;
    tokensConsumed: number;
  };
  backwardPath: {
    weakNodes: string[];
    extractionCacheEntries: string[];
    extractionPromptVersion: string;
  };
  rootCauses: string[];
}

export interface WeakNodeDiagnostic {
  nodeId: string;
  nodeLabel: string;
  failureModes: string[];
  suggestedPrompts: string[];
  estimatedImpact: number;
}

export interface QueryScore {
  query: string;
  confidence: number;
  efficiency: number;
  tier: number;
  tokens: number;
}

export interface ValidationResult {
  passed: boolean;
  compositeScore: number;
  details: {
    previousAvg: number;
    currentAvg: number;
    change: number;
    threshold: number;
  };
}

export interface RefinementHistoryEntry {
  version: string;
  timestamp: string;
  promptDiff: string;
  diagnostics: WeakNodeDiagnostic[];
  validationScore: number;
  rollbackOf?: string;
}

// === MCP tool types ===

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface MCPTransport {
  send: (response: unknown, eventId?: string) => void;
  onRequest: (handler: (request: unknown) => Promise<unknown>) => void;
  close?: () => void;
}

// === GraphWiki Tools ===

export type GraphWikiToolName =
  | 'query_graph'
  | 'get_node'
  | 'get_neighbors'
  | 'shortest_path'
  | 'god_nodes'
  | 'wiki_read'
  | 'wiki_search'
  | 'wiki_list'
  | 'community_summary'
  | 'community_list'
  | 'build'
  | 'ingest'
  | 'lint'
  | 'status'
  | 'benchmark'
  | 'ask';

export interface ToolContext {
  graph: GraphDocument;
  graphState?: {
    graph: GraphDocument;
    writeLock: { acquire: () => Promise<void>; release: () => void };
    lastModified: string;
  };
  wikiPath?: string;
  corpusPath?: string;
}

// === CLI types ===

export interface CLIOptions {
  update?: boolean;
  resume?: boolean;
  permissive?: boolean;
  fullCluster?: boolean;
  http?: boolean;
  port?: number;
  platform?: 'claude' | 'codex' | 'gemini' | 'cursor' | 'openclaw';
  fix?: boolean;
  review?: boolean;
  rollback?: boolean;
  force?: boolean;
}

// === Lock file types ===

export interface LockFile {
  pid: number;
  timestamp: string;
  version: string;
}

// ─── Phase 1: Extraction Core Types ──────────────────────────────────────────

export type NodeType =
  | "function"
  | "class"
  | "module"
  | "interface"
  | "type"
  | "concept"
  | "entity"
  | "rationale"
  | "document"
  | "comparison"
  | "decision";

export type EdgeRelation =
  | "calls"
  | "imports"
  | "uses"
  | "defines"
  | "implements"
  | "extends"
  | "overrides"
  | "instantiates"
  | "semantically_similar_to"
  | "related_to"
  | "contradicts"
  | "supersedes"
  | "depends_on"
  | "rationale_for"
  | "alternative_to";

export type ConfidenceLevel = "EXTRACTED" | "INFERRED" | "AMBIGUOUS";

export interface Hyperedge {
  id: string;
  nodes: string[];
  relation: EdgeRelation;
  confidence_level: ConfidenceLevel;
  metadata?: Record<string, unknown>;
}

export interface CommunityMeta {
  id: string;
  name: string;
  size: number;
  density: number;
  nodes: string[];
  edges: string[];
  metadata?: Record<string, unknown>;
}

export interface ExtractionConfig {
  cache_dir?: string;
  max_cache_age_ms?: number;
  extractor?: "ast" | "llm" | "hybrid";
  llm_provider?: string;
  timeout_ms?: number;
  max_tokens?: number;
}

export interface ManifestEntry {
  file: string;
  hash: string;
  extractor: string;
  timestamp: number;
  size_bytes: number;
  node_count: number;
  edge_count: number;
  error?: string;
}

export interface ExtractionResult {
  document: GraphDocument;
  cache_hit: boolean;
  duration_ms: number;
  tokens_used?: number;
}

export interface ValidationError {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface Coercion {
  path: string;
  original: unknown;
  coerced: unknown;
  rule: string;
}

export interface FailedFile {
  file: string;
  reason: "parse_error" | "extraction_error" | "timeout" | "rate_limited" | "invalid_output" | "unknown";
  error: string;
  timestamp: number;
}

export interface SkippedFile {
  file: string;
  reason: "empty" | "binary" | "too_large" | "unsupported_type" | "ignored";
  timestamp: number;
}

export interface BatchState {
  started_at: number;
  completed_at?: number;
  total_files: number;
  assigned_files: Map<number, string[]>;
  completed: string[];
  failed: FailedFile[];
  skipped: SkippedFile[];
}

export interface SubagentState {
  id: number;
  assigned_files: string[];
  completed_files: string[];
  failed_files: string[];
  skipped_files: string[];
  current_file?: string;
  started_at?: number;
}

export interface DispatcherConfig {
  requests_per_minute: number;
  burst_limit: number;
  backoff_base_ms: number;
  backoff_max_ms: number;
  backoff_multiplier: number;
  circuit_breaker_threshold: number;
  circuit_breaker_reset_ms: number;
  retry_attempts: number;
}

export interface DispatcherState {
  circuit_open: boolean;
  circuit_opened_at?: number;
  consecutive_failures: number;
  total_dispatches: number;
}

export interface ThroughputMetrics {
  calls_total: number;
  calls_succeeded: number;
  calls_failed: number;
  calls_rate_limited: number;
  avg_latency_ms: number;
  tokens_per_minute: number;
}

export interface CompilationBudget {
  max_nodes: number;
  max_edges: number;
  max_bytes: number;
  timeout_ms: number;
}

export interface Tokenizer {
  encode(text: string): Promise<number[]>;
  decode(tokens: number[]): Promise<string>;
  tokenCount(text: string): Promise<number>;
}