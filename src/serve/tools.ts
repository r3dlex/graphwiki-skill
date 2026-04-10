// Shared MCP tool definitions for GraphWiki v2
// All 15 GraphWikiTools as MCP tool definitions

import type { MCPToolDefinition, ToolContext, GraphWikiToolName } from '../types.js';
import type { GraphDocument, GraphNode } from '../types.js';

// Tool definitions for all 15 GraphWiki tools
export const GRAPH_WIKI_TOOLS: MCPToolDefinition[] = [
  // Graph query tools
  {
    name: 'query_graph',
    description: 'Query the knowledge graph with a natural language question. Returns relevant nodes and their relationships.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language query' },
        max_nodes: { type: 'number', description: 'Maximum nodes to return', default: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_node',
    description: 'Get detailed information about a specific node by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        node_id: { type: 'string', description: 'Node ID' },
        include_neighbors: { type: 'boolean', description: 'Include neighbor nodes', default: false },
      },
      required: ['node_id'],
    },
  },
  {
    name: 'get_neighbors',
    description: 'Get all neighboring nodes of a given node.',
    inputSchema: {
      type: 'object',
      properties: {
        node_id: { type: 'string', description: 'Node ID' },
        max_depth: { type: 'number', description: 'Maximum traversal depth', default: 1 },
        edge_types: { type: 'array', items: { type: 'string' }, description: 'Filter by edge types' },
      },
      required: ['node_id'],
    },
  },
  {
    name: 'shortest_path',
    description: 'Find the shortest path between two nodes in the graph.',
    inputSchema: {
      type: 'object',
      properties: {
        node_a: { type: 'string', description: 'Start node ID' },
        node_b: { type: 'string', description: 'End node ID' },
      },
      required: ['node_a', 'node_b'],
    },
  },
  {
    name: 'god_nodes',
    description: 'Find highly connected hub nodes (authority nodes) in the graph.',
    inputSchema: {
      type: 'object',
      properties: {
        min_degree: { type: 'number', description: 'Minimum degree threshold', default: 10 },
        limit: { type: 'number', description: 'Maximum nodes to return', default: 20 },
      },
    },
  },

  // Wiki tools
  {
    name: 'wiki_read',
    description: 'Read a wiki page by title.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Wiki page title' },
      },
      required: ['title'],
    },
  },
  {
    name: 'wiki_search',
    description: 'Search wiki pages by content or title.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Maximum results', default: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'wiki_list',
    description: 'List all wiki pages, optionally filtered by type.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['concept', 'entity', 'source-summary', 'comparison'], description: 'Filter by page type' },
        limit: { type: 'number', description: 'Maximum results', default: 50 },
      },
    },
  },

  // Community tools
  {
    name: 'community_summary',
    description: 'Get a summary of a community of related nodes.',
    inputSchema: {
      type: 'object',
      properties: {
        community_id: { type: 'number', description: 'Community ID' },
      },
      required: ['community_id'],
    },
  },
  {
    name: 'community_list',
    description: 'List all communities in the graph.',
    inputSchema: {
      type: 'object',
      properties: {
        min_size: { type: 'number', description: 'Minimum community size', default: 2 },
      },
    },
  },

  // Build/ingest tools
  {
    name: 'build',
    description: 'Trigger a graph build from source files.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Source path to build from' },
        update: { type: 'boolean', description: 'Incremental update', default: false },
        resume: { type: 'boolean', description: 'Resume interrupted build', default: false },
        permissive: { type: 'boolean', description: 'Allow coerced results', default: false },
        full_cluster: { type: 'boolean', description: 'Build full cluster', default: false },
      },
    },
  },
  {
    name: 'ingest',
    description: 'Ingest a new source file into the graph.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source file path' },
      },
      required: ['source'],
    },
  },

  // System tools
  {
    name: 'lint',
    description: 'Run a health check on the graph.',
    inputSchema: {
      type: 'object',
      properties: {
        fix: { type: 'boolean', description: 'Auto-fix issues', default: false },
      },
    },
  },
  {
    name: 'status',
    description: 'Get graph statistics and health status.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'benchmark',
    description: 'Run a benchmark query and measure token usage.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Benchmark query' },
      },
      required: ['query'],
    },
  },

  // Ask tool
  {
    name: 'ask',
    description: 'Ask a question using the full GraphWiki context.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Question to answer' },
        max_tier: { type: 'number', description: 'Maximum context tier', default: 3 },
      },
      required: ['question'],
    },
  },
];

/**
 * Tool executor function type
 */
export type ToolExecutor = (
  toolName: GraphWikiToolName,
  params: Record<string, unknown>,
  context: ToolContext
) => Promise<unknown>;

/**
 * Tool set type alias
 */
export type GraphWikiTools = MCPToolDefinition[];

/**
 * Register tools with a transport - returns handler for incoming requests
 */
export function registerTools(
  tools: MCPToolDefinition[],
  executor: ToolExecutor
): (request: unknown) => Promise<unknown> {
  return async (request: unknown): Promise<unknown> => {
    const req = request as { method: string; params?: Record<string, unknown>; id?: string | number };

    if (req.method === 'tools/list') {
      return {
        tools,
      };
    }

    if (req.method === 'tools/call') {
      const { name, arguments: args } = req.params as { name: string; arguments: Record<string, unknown> };
      const result = await executor(name as GraphWikiToolName, args, req.params as unknown as ToolContext);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }

    throw new Error(`Unknown method: ${req.method}`);
  };
}

// === Helper functions for tool implementations ===

/**
 * Find a node by ID in the graph
 */
export function findNode(graph: GraphDocument, nodeId: string): GraphNode | undefined {
  return graph.nodes.find(n => n.id === nodeId);
}

/**
 * Get neighbors of a node
 */
export function getNeighbors(graph: GraphDocument, nodeId: string, maxDepth = 1): GraphNode[] {
  const visited = new Set<string>();
  const result: GraphNode[] = [];
  const queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id) || depth > maxDepth) continue;
    visited.add(id);

    const node = findNode(graph, id);
    if (node && id !== nodeId) {
      result.push(node);
    }

    // Find edges where this node is source
    const outgoingEdges = graph.edges.filter(e => e.source === id);
    for (const edge of outgoingEdges) {
      if (!visited.has(edge.target)) {
        queue.push({ id: edge.target, depth: depth + 1 });
      }
    }

    // Find edges where this node is target
    const incomingEdges = graph.edges.filter(e => e.target === id);
    for (const edge of incomingEdges) {
      if (!visited.has(edge.source)) {
        queue.push({ id: edge.source, depth: depth + 1 });
      }
    }
  }

  return result;
}

/**
 * Compute degree of a node
 */
export function getNodeDegree(graph: GraphDocument, nodeId: string): number {
  return graph.edges.filter(e => e.source === nodeId || e.target === nodeId).length;
}

/**
 * Find shortest path using BFS
 */
export function findShortestPath(
  graph: GraphDocument,
  nodeA: string,
  nodeB: string
): string[] | null {
  if (nodeA === nodeB) return [nodeA];

  const visited = new Set<string>();
  const queue: Array<{ id: string; path: string[] }> = [{ id: nodeA, path: [nodeA] }];
  visited.add(nodeA);

  while (queue.length > 0) {
    const { id, path } = queue.shift()!;

    const neighbors = [
      ...graph.edges.filter(e => e.source === id).map(e => e.target),
      ...graph.edges.filter(e => e.target === id).map(e => e.source),
    ];

    for (const neighbor of neighbors) {
      if (neighbor === nodeB) {
        return [...path, nodeB];
      }

      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ id: neighbor, path: [...path, neighbor] });
      }
    }
  }

  return null;
}

/**
 * Group nodes by community
 */
export function groupByCommunity(nodes: GraphNode[]): Map<number, GraphNode[]> {
  const groups = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    const community = node.community ?? -1;
    if (!groups.has(community)) {
      groups.set(community, []);
    }
    groups.get(community)!.push(node);
  }
  return groups;
}
