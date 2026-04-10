---
title: "ADR-003: Dual-Transport MCP Server"
status: accepted
date: 2026-04-10
graph_nodes: ["mcp-server", "stdio-transport", "http-transport", "sse-broadcast", "write-mutex"]
graph_community: 3
sources: ["src/serve/mcp-stdio.ts", "src/serve/mcp-http.ts", "src/serve/mcp-stdio.test.ts", "src/serve/mcp-http.test.ts"]
related: ["ADR-001", "ADR-004"]
confidence: high
---

**Context**

The MCP server exposes GraphWiki functionality over two transports simultaneously:

- **stdio transport** (`createStdioTransport`, src/serve/mcp-stdio.ts): Reads newline-delimited JSON-RPC 2.0 messages from `stdin`, writes responses to `stdout`. Handles batch requests, notifications (fire-and-forget, no `id`), and errors with standard codes (-32700 Parse Error, -32600 Invalid Request, -32603 Internal Error).
- **HTTP/SSE transport** (`createHttpTransport`, src/serve/mcp-http.ts): POST `/mcp` for JSON-RPC request/response; GET `/mcp/stream` for SSE broadcast. CORS is open (`*`). SSE clients receive `connected` event on connect and keep-alive pings every 30 s.

`createMutex` implements a simple spin-wait acquire/release for write serialisation. `createGraphState` wraps the graph, its mutex, and `lastModified` timestamp.

**Decision**

1. The stdio transport must not write to `stdout` after `process.stdin` ends or after `close()` is called.
2. SSE broadcast must handle concurrent client disconnects without throwing (clients are removed from the `Set` inside `req.on('close')`).
3. HTTP POST `/mcp` returns 400 for non-`"2.0"` `jsonrpc` field, 500 for unregistered handler, and always returns a JSON-RPC 2.0 response object.
4. The mutex acquire is spin-wait-based (no external dependency); callers must not hold the lock across `await` points that may yield to other tasks.
5. Both transports share no mutable state; SSE clients are module-level (`const sseClients = new Set(...)`).

**Consequences**

- Positive: Dual-transport enables both Claude Code MCP integration (stdio) and browser/curl exploration (HTTP).
- Positive: JSON-RPC 2.0 compliance ensures interoperability with standard clients.
- Negative: Spin-wait mutex has poor scalability above ~10 concurrent writers; future iteration should use `async-mutex` or equivalent.
- Negative: CORS is open (`*`); production deployments must add authentication middleware.
