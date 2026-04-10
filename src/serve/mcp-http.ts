// MCP HTTP/SSE transport for GraphWiki v2
// HTTP/SSE for streaming responses with Express

import type { Express } from 'express';
import type { GraphDocument, MCPRequest } from '../types.js';

// Lock interface for write operations
export interface Mutex {
  acquire: () => Promise<void>;
  release: () => void;
}

// Graph state managed by the HTTP transport
export interface GraphState {
  graph: GraphDocument;
  writeLock: Mutex;
  lastModified: string;
}

interface HttpTransport {
  send: (response: unknown, eventId?: string) => void;
  stream: (data: unknown, event: string) => void;
  close?: () => void;
}

// SSE clients for streaming
const sseClients = new Set<(data: string, event?: string) => void>();

/**
 * Create an MCP transport over HTTP with SSE support
 */
export function createHttpTransport(app: Express): HttpTransport {
  // POST /mcp - JSON-RPC request/response
  app.post('/mcp', async (req, res) => {
    try {
      const rpcRequest = req.body as MCPRequest;

      // Validate JSON-RPC 2.0
      if (rpcRequest.jsonrpc !== '2.0') {
        res.status(400).json({
          jsonrpc: '2.0',
          id: rpcRequest.id ?? null,
          error: {
            code: -32600,
            message: 'Invalid Request: JSON-RPC 2.0 required',
          },
        });
        return;
      }

      // Get handler from app.locals if set
      const handler = (req.app.locals as { mcpHandler?: (req: unknown) => Promise<unknown> }).mcpHandler;
      if (!handler) {
        res.status(500).json({
          jsonrpc: '2.0',
          id: rpcRequest.id ?? null,
          error: {
            code: -32603,
            message: 'No MCP handler registered',
          },
        });
        return;
      }

      // Handle request
      const result = await handler(rpcRequest);
      res.json({
        jsonrpc: '2.0',
        id: rpcRequest.id,
        result,
      });
    } catch (err) {
      res.status(500).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Internal error',
          data: err instanceof Error ? err.message : String(err),
        },
      });
    }
  });

  // GET /mcp/stream - SSE event stream
  app.get('/mcp/stream', (req, res) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    // Generate client ID
    const clientId = Date.now();

    // Client handler function
    const clientHandler = (data: string, event?: string) => {
      if (event) {
        res.write(`event: ${event}\n`);
      }
      res.write(`data: ${data}\n\n`);
    };

    // Add client to set
    sseClients.add(clientHandler);

    // Send initial connection event
    res.write(`event: connected\n`);
    res.write(`data: ${JSON.stringify({ clientId, timestamp: new Date().toISOString() })}\n\n`);

    // Keep-alive ping every 30 seconds
    const pingInterval = setInterval(() => {
      res.write(`: ping\n\n`);
    }, 30000);

    // Handle client disconnect
    req.on('close', () => {
      clearInterval(pingInterval);
      sseClients.delete(clientHandler);
    });
  });

  // OPTIONS /mcp - CORS preflight
  app.options('/mcp', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.sendStatus(204);
  });

  // OPTIONS /mcp/stream - CORS preflight for SSE
  app.options('/mcp/stream', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.sendStatus(204);
  });

  return {
    send: (response: unknown, eventId?: string): void => {
      // Broadcast to all SSE clients
      const data = JSON.stringify(response);
      for (const client of sseClients) {
        client(data, eventId);
      }
    },

    stream: (data: unknown, event: string): void => {
      const payload = JSON.stringify(data);
      for (const client of sseClients) {
        client(payload, event);
      }
    },

    close: (): void => {
      sseClients.clear();
    },
  };
}

/**
 * Set the MCP request handler on an Express app
 */
export function setMcpHandler(app: Express, handler: (request: unknown) => Promise<unknown>): void {
  app.locals = { ...app.locals, mcpHandler: handler };
}

/**
 * Broadcast an event to all SSE clients
 */
export function broadcastEvent(event: string, data: unknown): void {
  const payload = JSON.stringify(data);
  for (const client of sseClients) {
    client(payload, event);
  }
}

/**
 * Get number of connected SSE clients
 */
export function getSseClientCount(): number {
  return sseClients.size;
}

/**
 * Create a simple mutex for write operations
 */
export function createMutex(): Mutex {
  let locked = false;

  return {
    acquire: async (): Promise<void> => {
      if (locked) {
        await new Promise<void>(resolve => {
          const check = setInterval(() => {
            if (!locked) {
              clearInterval(check);
              resolve();
            }
          }, 10);
        });
      }
      locked = true;
    },

    release: (): void => {
      if (locked) {
        locked = false;
      }
    },
  };
}

/**
 * Create initial graph state
 */
export function createGraphState(graph: GraphDocument): GraphState {
  return {
    graph,
    writeLock: createMutex(),
    lastModified: new Date().toISOString(),
  };
}
