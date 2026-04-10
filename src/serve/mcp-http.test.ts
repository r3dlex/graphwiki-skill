import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { createHttpTransport, setMcpHandler, broadcastEvent, getSseClientCount, createMutex, createGraphState } from './mcp-http.js';

describe('mcp-http', () => {
  describe('createMutex', () => {
    it('should create a mutex with acquire and release', () => {
      const mutex = createMutex();

      expect(typeof mutex.acquire).toBe('function');
      expect(typeof mutex.release).toBe('function');
    });

    it('should allow acquire after release', async () => {
      const mutex = createMutex();

      await mutex.acquire();
      mutex.release();
      await mutex.acquire();

      expect(true).toBe(true); // No error thrown
    });

    it('should serialize concurrent acquire calls', async () => {
      const mutex = createMutex();
      const order: number[] = [];

      mutex.acquire().then(() => order.push(1));
      mutex.acquire().then(() => order.push(2));

      await new Promise(resolve => setTimeout(resolve, 50));
      mutex.release();
      await new Promise(resolve => setTimeout(resolve, 50));
      mutex.release();

      // First acquire should complete before second
      expect(order).toEqual([1, 2]);
    });
  });

  describe('createGraphState', () => {
    it('should create graph state with initial values', () => {
      const graph = { nodes: [], edges: [] };
      const state = createGraphState(graph);

      expect(state.graph).toEqual(graph);
      expect(state.writeLock).toBeDefined();
      expect(state.lastModified).toBeDefined();
    });
  });

  describe('createHttpTransport', () => {
    let app: ReturnType<typeof express>;

    beforeEach(() => {
      app = express();
      app.use(express.json());
    });

    it('should create transport with send and stream', () => {
      const transport = createHttpTransport(app);

      expect(transport).toHaveProperty('send');
      expect(transport).toHaveProperty('stream');
      expect(typeof transport.send).toBe('function');
      expect(typeof transport.stream).toBe('function');
    });

    it('should register POST /mcp endpoint', async () => {
      createHttpTransport(app);

      // App should have routes registered
      const routes: string[] = [];
      app._router?.stack.forEach((layer: { route?: { path: string; methods: Record<string, boolean> } }) => {
        if (layer.route) {
          routes.push(layer.route.path);
        }
      });

      expect(routes).toContain('/mcp');
      expect(routes).toContain('/mcp/stream');
    });

    it('should handle JSON-RPC request when handler is set', async () => {
      createHttpTransport(app);

      const mockHandler = vi.fn().mockResolvedValue({ result: 'success' });
      setMcpHandler(app, mockHandler);

      // Find the POST /mcp route handler in the router stack
      const routeLayer = app._router.stack.find(
        (layer: { route?: { path: string; methods: Record<string, boolean> } }) =>
          layer.route?.path === '/mcp' && layer.route?.methods?.post
      );
      expect(routeLayer).toBeDefined();

      const mockReq = {
        body: { jsonrpc: '2.0', id: 1, method: 'test' },
        query: {},
        method: 'POST',
        path: '/mcp',
        url: '/mcp',
        headers: {},
        get: vi.fn(),
        app: app,
      };
      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };
      const mockNext = vi.fn();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (routeLayer.handle as any)(mockReq, mockRes, mockNext);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('should reject non-JSON-RPC 2.0 requests', async () => {
      createHttpTransport(app);

      // Find the POST /mcp route handler in the router stack
      const routeLayer = app._router.stack.find(
        (layer: { route?: { path: string; methods: Record<string, boolean> } }) =>
          layer.route?.path === '/mcp' && layer.route?.methods?.post
      );
      expect(routeLayer).toBeDefined();

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (routeLayer.handle as any)(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { body: { jsonrpc: '1.0', id: 1, method: 'test' }, query: {}, method: 'POST', path: '/mcp', url: '/mcp', headers: {}, get: vi.fn(), app: app },
        mockRes,
        vi.fn()
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('setMcpHandler', () => {
    it('should set handler on app.locals', () => {
      const app = express();
      const handler = vi.fn();

      setMcpHandler(app, handler);

      expect((app.locals as { mcpHandler: unknown }).mcpHandler).toBe(handler);
    });
  });

  describe('getSseClientCount', () => {
    it('should return 0 initially', () => {
      expect(getSseClientCount()).toBe(0);
    });
  });

  describe('broadcastEvent', () => {
    it('should not throw with no clients', () => {
      expect(() => broadcastEvent('test', { data: 'test' })).not.toThrow();
    });
  });
});
