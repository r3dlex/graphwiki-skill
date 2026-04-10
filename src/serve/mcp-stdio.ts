// MCP JSON-RPC over stdio transport for GraphWiki v2
// Reads from stdin, writes to stdout

import type { MCPTransport, MCPRequest, MCPResponse } from '../types.js';

interface StdioTransport extends MCPTransport {
  send: (response: unknown, eventId?: string) => void;
  onRequest: (handler: (request: unknown) => Promise<unknown>) => void;
  close: () => void;
}

interface JSONRPCMessage {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Create an MCP transport over stdio
 * @returns Transport object with send() and onRequest()
 */
export function createStdioTransport(): StdioTransport {
  let requestHandler: ((request: unknown) => Promise<unknown>) | null = null;
  let isRunning = true;

  // Set up stdin listener
  let buffer = '';
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', async (chunk: string) => {
    buffer += chunk;

    // Process complete JSON-RPC messages (newline-delimited JSON)
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const message = JSON.parse(trimmed) as JSONRPCMessage;
        await processMessage(message);
      } catch (err) {
        // Try to parse as batch
        try {
          const batch = JSON.parse(trimmed) as JSONRPCMessage[];
          if (Array.isArray(batch)) {
            for (const msg of batch) {
              await processMessage(msg);
            }
          }
        } catch {
          // Invalid JSON - send error response
          const errorResponse: JSONRPCMessage = {
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32700,
              message: 'Parse error: Invalid JSON',
              data: String(err),
            },
          };
          sendInternal(errorResponse);
        }
      }
    }
  });

  process.stdin.on('end', () => {
    isRunning = false;
  });

  async function processMessage(message: JSONRPCMessage): Promise<void> {
    if (!requestHandler) {
      const errorResponse: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: message.id ?? null,
        error: {
          code: -32600,
          message: 'No handler registered',
        },
      };
      sendInternal(errorResponse);
      return;
    }

    // Handle notifications (no id)
    if (message.method && !message.id) {
      // Fire-and-forget notification - don't wait for response
      requestHandler(message).catch(() => {
        // Notifications don't get responses
      });
      return;
    }

    // Handle request (has id)
    if (message.method && message.id !== undefined) {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: message.id ?? undefined,
        method: message.method,
        params: message.params,
      };

      try {
        const result = await requestHandler(request);
        const response: MCPResponse = {
          jsonrpc: '2.0',
          id: message.id ?? undefined,
          result,
        };
        sendInternal(response);
      } catch (err) {
        const response: MCPResponse = {
          jsonrpc: '2.0',
          id: message.id ?? undefined,
          error: {
            code: -32603,
            message: 'Internal error',
            data: err instanceof Error ? err.message : String(err),
          },
        };
        sendInternal(response);
      }
    }

    // Handle response (has result/error but no method)
    if (!message.method && message.id !== undefined) {
      // This shouldn't happen in our stdio protocol (we don't send requests from server)
      // but handle it gracefully
    }
  }

  function sendInternal(response: unknown): void {
    if (!isRunning) return;
    const line = JSON.stringify(response);
    process.stdout.write(line + '\n');
  }

  return {
    send: sendInternal,

    onRequest: (handler: (request: unknown) => Promise<unknown>): void => {
      requestHandler = handler;
    },

    close: (): void => {
      isRunning = false;
      process.stdin.pause();
    },
  };
}

/**
 * Send a JSON-RPC response to stdout
 */
export function sendResponse(response: MCPResponse): void {
  const line = JSON.stringify(response);
  process.stdout.write(line + '\n');
}

/**
 * Send a JSON-RPC notification (no response expected)
 */
export function sendNotification(method: string, params?: Record<string, unknown>): void {
  const message: JSONRPCMessage = {
    jsonrpc: '2.0',
    method,
    params,
  };
  const line = JSON.stringify(message);
  process.stdout.write(line + '\n');
}

/**
 * Parse incoming JSON-RPC message
 */
export function parseMessage(data: string): JSONRPCMessage | JSONRPCMessage[] | null {
  try {
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return parsed as JSONRPCMessage;
  } catch {
    return null;
  }
}

/**
 * Create error response
 */
export function createErrorResponse(
  id: string | number | null | undefined,
  code: number,
  message: string,
  data?: unknown
): MCPResponse {
  return {
    jsonrpc: '2.0',
    id: id ?? undefined,
    error: { code, message, data },
  };
}

// Error codes
export const JSONRPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;
