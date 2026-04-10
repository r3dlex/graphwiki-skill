import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStdioTransport, sendResponse, sendNotification, parseMessage, createErrorResponse, JSONRPC_ERROR_CODES } from './mcp-stdio.js';

// Mock process.stdin and process.stdout
const mockStdin = {
  setEncoding: vi.fn(),
  on: vi.fn(),
  pause: vi.fn(),
};

const mockStdout = {
  write: vi.fn(),
};

vi.stubGlobal('process', {
  stdin: mockStdin,
  stdout: mockStdout,
  stderr: { write: vi.fn() },
});

describe('mcp-stdio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createStdioTransport', () => {
    it('should create a transport with send and onRequest', () => {
      const transport = createStdioTransport();

      expect(transport).toHaveProperty('send');
      expect(transport).toHaveProperty('onRequest');
      expect(transport).toHaveProperty('close');
      expect(typeof transport.send).toBe('function');
      expect(typeof transport.onRequest).toBe('function');
      expect(typeof transport.close).toBe('function');
    });

    it('should register request handler', () => {
      const transport = createStdioTransport();
      const handler = vi.fn().mockResolvedValue({ result: 'test' });

      transport.onRequest(handler);

      // Handler should be called when a message is processed
      // We can't easily test stdin input, but we can verify the API
      expect(mockStdin.on).toHaveBeenCalledWith('data', expect.any(Function));
    });

    it('should send JSON-RPC response through stdout', () => {
      const transport = createStdioTransport();

      transport.send({ jsonrpc: '2.0', id: 1, result: { foo: 'bar' } });

      expect(mockStdout.write).toHaveBeenCalledWith(
        JSON.stringify({ jsonrpc: '2.0', id: 1, result: { foo: 'bar' } }) + '\n'
      );
    });

    it('should handle close', () => {
      const transport = createStdioTransport();

      transport.close();

      expect(mockStdin.pause).toHaveBeenCalled();
    });
  });

  describe('sendResponse', () => {
    it('should send a JSON-RPC response', () => {
      const response = {
        jsonrpc: '2.0' as const,
        id: 42,
        result: { answer: 'test' },
      };

      sendResponse(response);

      expect(mockStdout.write).toHaveBeenCalledWith(
        JSON.stringify(response) + '\n'
      );
    });
  });

  describe('sendNotification', () => {
    it('should send a JSON-RPC notification without id', () => {
      sendNotification('tools/list');

      expect(mockStdout.write).toHaveBeenCalledWith(
        JSON.stringify({ jsonrpc: '2.0', method: 'tools/list' }) + '\n'
      );
    });

    it('should send notification with params', () => {
      sendNotification('initialized', { version: '1.0' });

      expect(mockStdout.write).toHaveBeenCalledWith(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialized',
          params: { version: '1.0' },
        }) + '\n'
      );
    });
  });

  describe('parseMessage', () => {
    it('should parse valid JSON-RPC message', () => {
      const input = '{"jsonrpc":"2.0","id":1,"method":"test","params":{}}';
      const result = parseMessage(input);

      expect(result).toEqual({
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
        params: {},
      });
    });

    it('should parse JSON-RPC batch', () => {
      const input = '[{"jsonrpc":"2.0","id":1,"method":"test1"},{"jsonrpc":"2.0","id":2,"method":"test2"}]';
      const result = parseMessage(input);

      expect(result).toBeInstanceOf(Array);
      expect((result as unknown[]).length).toBe(2);
    });

    it('should return null for invalid JSON', () => {
      const input = 'not valid json {';
      const result = parseMessage(input);

      expect(result).toBeNull();
    });
  });

  describe('createErrorResponse', () => {
    it('should create parse error response', () => {
      const response = createErrorResponse(
        null,
        JSONRPC_ERROR_CODES.PARSE_ERROR,
        'Parse error'
      );

      expect(response).toEqual({
        jsonrpc: '2.0',
        id: undefined,
        error: {
          code: -32700,
          message: 'Parse error',
        },
      });
    });

    it('should create method not found response', () => {
      const response = createErrorResponse(
        123,
        JSONRPC_ERROR_CODES.METHOD_NOT_FOUND,
        'Method not found'
      );

      expect(response).toEqual({
        jsonrpc: '2.0',
        id: 123,
        error: {
          code: -32601,
          message: 'Method not found',
        },
      });
    });

    it('should create internal error response with data', () => {
      const response = createErrorResponse(
        'abc',
        JSONRPC_ERROR_CODES.INTERNAL_ERROR,
        'Internal error',
        { stack: 'error stack' }
      );

      expect(response).toEqual({
        jsonrpc: '2.0',
        id: 'abc',
        error: {
          code: -32603,
          message: 'Internal error',
          data: { stack: 'error stack' },
        },
      });
    });
  });

  describe('JSONRPC_ERROR_CODES', () => {
    it('should have correct error codes', () => {
      expect(JSONRPC_ERROR_CODES.PARSE_ERROR).toBe(-32700);
      expect(JSONRPC_ERROR_CODES.INVALID_REQUEST).toBe(-32600);
      expect(JSONRPC_ERROR_CODES.METHOD_NOT_FOUND).toBe(-32601);
      expect(JSONRPC_ERROR_CODES.INVALID_PARAMS).toBe(-32602);
      expect(JSONRPC_ERROR_CODES.INTERNAL_ERROR).toBe(-32603);
    });
  });
});
