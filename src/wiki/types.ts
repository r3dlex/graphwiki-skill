// Wiki page frontmatter
export interface WikiPageFrontmatter {
  node_id?: string;
  community?: number;
  type?: string;
  label: string;
  confidence?: 'high' | 'medium' | 'low';
  sources?: string[];
  related?: string[];
  created_at?: string;
  updated_at?: string;
  tags?: string[];
}

// Compiled wiki page with markdown content
export interface WikiPage {
  path: string;
  frontmatter: WikiPageFrontmatter;
  content: string;
}

// Community metadata from Leiden clustering
export interface CommunityMeta {
  id: number;
  node_count: number;
  label?: string;
  god_node_ids?: string[];
  dependency_order?: number;
}

// Stage 1: Skeleton compilation (high-level structure)
export interface Stage1Result {
  section_headers: string[];
  outline: string;
  tokens_used: number;
}

// Stage 2: Section expansion
export interface Stage2Result {
  section_content: string;
  tokens_used: number;
}

// Stage 3: Deep dive on a specific node
export interface Stage3Result {
  deep_content: string;
  source_verified: boolean;
  tokens_used: number;
}

// Compilation config for WikiCompiler
export interface CompilationConfig {
  stage1_budget_in?: number;
  stage1_budget_out?: number;
  stage2_budget_in?: number;
  stage2_budget_out?: number;
  stage3_budget_in?: number;
  stage3_budget_out?: number;
  parallel_limit?: number;
  mode?: 'standard' | 'deep';
  format?: 'obsidian' | 'plain';
}

// Query config for QueryRouter
export interface QueryConfig {
  tier0_budget?: number;
  tier1_budget?: number;
  tier2_budget?: number;
  tier3_budget?: number;
  tier4_budget?: number;
}

// Query result with tier tracking
export interface QueryResult {
  answer: string;
  tier_reached: number;
  tokens_consumed: number;
  pages_loaded: string[];
  nodes_traversed: string[];
}

// Lint result
export interface LintResult {
  valid: boolean;
  contradictions: Contradiction[];
  missing_sources: MissingSource[];
  broken_links: BrokenLink[];
}

// Contradiction between wiki content and graph edge relation
export interface Contradiction {
  node_id: string;
  wiki_content: string;
  edge_label: string;
  related_nodes: string[];
}

// Missing source for a node
export interface MissingSource {
  node_id: string;
  node_label: string;
  community: number;
}

// Broken wiki link
export interface BrokenLink {
  source_page: string;
  target_path: string;
  link_text: string;
}

// Surprise detection result
export interface Surprise {
  type: 'unexpected_connection' | 'isolated_cluster' | 'god_node_anomaly';
  description: string;
  affected_nodes: string[];
  severity: 'low' | 'medium' | 'high';
}

// Reporter config
export interface ReporterConfig {
  top_n_god_nodes?: number;
  output_dir?: string;
}
