import { Rule } from 'archgate';

export const gwServe001: Rule = {
  id: 'gw-serve-001',
  name: 'SSE cleanup on client disconnect',
  severity: 'error',
  scope: 'src/serve/',
  assert: (ctx) => {
    const { project } = ctx;
    const http = project.getSourceFile('src/serve/mcp-http.ts');
    if (!http) return;

    // Find sseClients.delete calls (SSE client removal)
    const sseDelete = http.getDescendantsOfKind(4 /* CallExpression */)
      .find(c => c.getText().includes('sseClients.delete'));

    if (!sseDelete) {
      ctx.violation('sseClients.delete not found in src/serve/mcp-http.ts');
      return;
    }

    // Walk parent chain and check for 'close'
    const parentChain = sseDelete.getAncestors().map(a => a.getKindName().toLowerCase());
    if (!parentChain.includes('close')) {
      ctx.violation('SSE client removal (sseClients.delete) must be inside req.on("close") handler');
    }

    // Also verify the close handler cleans up pingInterval
    const clearInterval = http.getDescendantsOfKind(4 /* CallExpression */)
      .find(c => c.getText().includes('clearInterval'));
    if (!clearInterval) {
      ctx.violation('clearInterval not found — pingInterval must be cleared on client disconnect');
      return;
    }

    const clearParentChain = clearInterval.getAncestors()
      .map(a => a.getKindName().toLowerCase());
    if (!clearParentChain.includes('close')) {
      ctx.violation('clearInterval(pingInterval) must be inside req.on("close") handler');
    }
  },
};

export const gwServe002: Rule = {
  id: 'gw-serve-002',
  name: 'Mutex lock/unlock symmetry',
  severity: 'error',
  scope: 'src/serve/',
  assert: (ctx) => {
    const { project } = ctx;
    const http = project.getSourceFile('src/serve/mcp-http.ts');
    if (!http) return;

    // Find all acquire() call expressions
    const acquires = http.getDescendantsOfKind(4 /* CallExpression */)
      .filter(c => c.getText().includes('.acquire()'));

    for (const acquire of acquires) {
      // Find the enclosing function/block
      let enclosingFunction = acquire.getFirstAncestor(174 /* ArrowFunction */) ||
        acquire.getFirstAncestor(11 /* FunctionDeclaration */) ||
        acquire.getFirstAncestor(10 /* FunctionExpression */);

      if (!enclosingFunction) {
        ctx.violation('mutex.acquire() found outside a named function — cannot verify lock symmetry');
        continue;
      }

      const funcText = enclosingFunction.getText();

      // Check for release() call in the function body
      const hasRelease = funcText.includes('.release()');
      const hasFinally = funcText.includes('finally');

      if (!hasRelease) {
        ctx.violation('mutex.acquire() found without a corresponding .release() call in the same function');
      } else if (hasRelease && !hasFinally) {
        // release() exists — warn if no finally block
        ctx.violation('mutex.release() should be called in a finally block to guarantee release on error');
      }
    }
  },
};

export const gwServe003: Rule = {
  id: 'gw-serve-003',
  name: 'Response headers idempotency',
  severity: 'error',
  scope: 'src/serve/',
  assert: (ctx) => {
    const { project } = ctx;
    const http = project.getSourceFile('src/serve/mcp-http.ts');
    if (!http) return;

    // Find all setHeader calls
    const setHeaders = http.getDescendantsOfKind(4 /* CallExpression */)
      .filter(c => c.getText().includes('setHeader('));

    // Group by response object (res)
    const headerCalls = new Map<string, { text: string; line: number }[]>();

    for (const call of setHeaders) {
      // Get the response object by traversing the call expression
      const args = call.getArguments();
      if (args.length < 2) continue;

      const headerName = args[0].getText();
      // Find the 'res' variable by tracing back
      const parentChain = call.getAncestors();
      let resExpr = '';
      for (const parent of parentChain) {
        const text = parent.getText();
        // Look for patterns like res.setHeader or res . setHeader
        const match = text.match(/res\s*\.\s*setHeader/);
        if (match) {
          resExpr = 'res';
          break;
        }
      }

      const key = resExpr + ':' + headerName;
      if (!headerCalls.has(key)) {
        headerCalls.set(key, []);
      }
      headerCalls.get(key)!.push({
        text: call.getText(),
        line: call.getStartLineNumber(),
      });
    }

    // Report duplicates
    for (const [key, calls] of headerCalls) {
      if (calls.length > 1) {
        ctx.violation(`setHeader called ${calls.length} times for header [${key}]: lines ${calls.map(c => c.line).join(', ')} — each header should be set at most once per response`);
      }
    }
  },
};

export const gwServe004: Rule = {
  id: 'gw-serve-004',
  name: 'No streaming after close',
  severity: 'error',
  scope: 'src/serve/',
  assert: (ctx) => {
    const { project } = ctx;
    const http = project.getSourceFile('src/serve/mcp-http.ts');
    if (!http) return;

    // Find all res.write calls in SSE handler
    const writeCalls = http.getDescendantsOfKind(4 /* CallExpression */)
      .filter(c => c.getText().includes('res.write('));

    for (const write of writeCalls) {
      const funcAncestor = write.getFirstAncestor(174 /* ArrowFunction */) ||
        write.getFirstAncestor(11 /* FunctionDeclaration */) ||
        write.getFirstAncestor(10 /* FunctionExpression */);

      if (!funcAncestor) continue;

      const funcText = funcAncestor.getText();

      // Check that writableEnded or similar guard exists before the write
      // or that the write is inside a conditional that checks stream state
      const hasGuard = funcText.includes('writableEnded') ||
        funcText.includes('!res.writableEnded') ||
        funcText.includes('res.writableEnded === false') ||
        funcText.includes('res.destroyed');

      // Check if the write call itself is inside a conditional
      const writeParent = write.getParent();
      const isConditional = writeParent?.getKindName() === 'IfStatement' ||
        writeParent?.getKindName() === 'ConditionalExpression';

      if (!hasGuard && !isConditional) {
        ctx.violation('res.write() in SSE handler should be guarded by res.writableEnded or similar stream state check to prevent writes after client disconnect');
      }
    }
  },
};

export const serveRules = [gwServe001, gwServe002, gwServe003, gwServe004];
export default serveRules;
