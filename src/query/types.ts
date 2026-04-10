// Query result with tier tracking
export interface QueryResult {
  answer: string;
  tier_reached: number;
  tokens_consumed: number;
  pages_loaded: string[];
  nodes_traversed: string[];
}

// Query config for QueryRouter
export interface QueryConfig {
  tier0_budget?: number;
  tier1_budget?: number;
  tier2_budget?: number;
  tier3_budget?: number;
  tier4_budget?: number;
}
