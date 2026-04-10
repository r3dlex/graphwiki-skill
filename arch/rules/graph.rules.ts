// Graph architectural rules — enforces ADR-001 invariants
import { Rule } from 'archgate';
import { Project, SyntaxKind } from 'ts-morph';

// ── Helper ──────────────────────────────────────────────────────────────────

function getBuilderSource(project: Project) {
  return project.getSourceFile('src/graph/builder.ts');
}

// ── Rule 1: Node ID determinism ─────────────────────────────────────────────
// _computeNodeId must call createHash('sha256') for deterministic IDs.

const gwGraph001: Rule = {
  id: 'gw-graph-001',
  name: 'Node ID determinism',
  severity: 'error',
  scope: 'src/graph/',
  assert: (ctx) => {
    const project = new Project({ tsConfigFilePath: './tsconfig.json' });
    const source = getBuilderSource(project);
    if (!source) return;

    const classDecl = source.getClass('GraphBuilder');
    const hashMethod = classDecl?.getMethod('_computeNodeId');
    if (!hashMethod) {
      ctx.violation('GraphBuilder._computeNodeId method is missing');
      return;
    }

    // Look for createHash('sha256') call inside the method body
    const callExprs = hashMethod.getDescendantsOfKind(SyntaxKind.CallExpression);
    const hasHash = callExprs.some((call) => {
      const exprText = call.getExpression().getText();
      const args = call.getArguments();
      return (
        exprText === 'createHash' &&
        args.length > 0 &&
        /['"]sha256['"]/i.test(args[0].getText())
      );
    });

    if (!hasHash) {
      ctx.violation(
        'GraphBuilder._computeNodeId must call createHash(\'sha256\') for deterministic ID generation'
      );
    }
  },
};

// ── Rule 2: Merge idempotency ───────────────────────────────────────────────
// Nodes array must be spread-cloned (not mutated directly) when merging.

const gwGraph002: Rule = {
  id: 'gw-graph-002',
  name: 'Merge idempotency',
  severity: 'error',
  scope: 'src/graph/',
  assert: (ctx) => {
    const project = new Project({ tsConfigFilePath: './tsconfig.json' });
    const source = getBuilderSource(project);
    if (!source) return;

    const classDecl = source.getClass('GraphBuilder');
    const addNodes = classDecl?.getMethod('addNodes');
    if (!addNodes) return;

    // Check that nodes record is accessed via spread when updating
    // The merge path should use: this.nodes[id] = { ...existing, ...node, ... }
    // which spread-clones rather than pushing/mutating the array.
    // We verify the merge branch assigns via object spread.
    const mergeBranches = addNodes.getDescendantsOfKind(SyntaxKind.IfStatement);
    let hasSpreadMerge = false;

    for (const branch of mergeBranches) {
      const stmts = branch.getThenStatement()?.getDescendantsOfKind(SyntaxKind.ExpressionStatement) ?? [];
      for (const stmt of stmts) {
        const text = stmt.getText();
        // Detect: this.nodes[id] = { ...existing, ...node, id, provenance: [...] }
        if (/this\.nodes\[id\]\s*=\s*\{\s*\.\.\./.test(text)) {
          hasSpreadMerge = true;
        }
      }
    }

    if (!hasSpreadMerge) {
      ctx.violation('addNodes merge branch must use spread clone (this.nodes[id] = { ...existing, ...node })');
    }
  },
};

// ── Rule 3: Edge weight accumulation ────────────────────────────────────────
// addEdges must accumulate (+=) weights for duplicate edges, not push duplicates.

const gwGraph003: Rule = {
  id: 'gw-graph-003',
  name: 'Edge weight accumulation',
  severity: 'error',
  scope: 'src/graph/',
  assert: (ctx) => {
    const project = new Project({ tsConfigFilePath: './tsconfig.json' });
    const source = getBuilderSource(project);
    if (!source) return;

    const classDecl = source.getClass('GraphBuilder');
    const addEdges = classDecl?.getMethod('addEdges');
    if (!addEdges) return;

    // Look for += operator applied to an edge weight property
    const ops = addEdges.getDescendantsOfKind(SyntaxKind.BinaryExpression);
    const hasWeightAccumulation = ops.some(
      (op) =>
        op.getOperatorToken().getKind() === SyntaxKind.PlusEqualsToken &&
        /existing\.\w+\.weight|edge\.weight/.test(op.getText())
    );

    if (!hasWeightAccumulation) {
      ctx.violation('addEdges must accumulate edge weights with += for duplicate edges');
    }
  },
};

// ── Rule 4: Completeness metric ──────────────────────────────────────────────
// build() must compute completeness from provenance.length > 0

const gwGraph004: Rule = {
  id: 'gw-graph-004',
  name: 'Completeness metric',
  severity: 'error',
  scope: 'src/graph/',
  assert: (ctx) => {
    const project = new Project({ tsConfigFilePath: './tsconfig.json' });
    const source = getBuilderSource(project);
    if (!source) return;

    const classDecl = source.getClass('GraphBuilder');
    const buildMethod = classDecl?.getMethod('build');
    if (!buildMethod) {
      ctx.violation('GraphBuilder.build() method is missing');
      return;
    }

    // Verify completeness is derived from provenance.length check
    const text = buildMethod.getText();
    const hasProvenanceCheck = /provenance.*length|length.*provenance/.test(text);

    if (!hasProvenanceCheck) {
      ctx.violation('build() must compute completeness from provenance.length > 0');
    }
  },
};

// ── Rule 5: No direct nodes/edges mutation ──────────────────────────────────
// No direct assignment to graph.nodes or graph.edges outside the constructor.

const gwGraph005: Rule = {
  id: 'gw-graph-005',
  name: 'No direct nodes/edges mutation',
  severity: 'error',
  scope: 'src/graph/',
  assert: (ctx) => {
    const project = new Project({ tsConfigFilePath: './tsconfig.json' });
    const source = getBuilderSource(project);
    if (!source) return;

    const classDecl = source.getClass('GraphBuilder');
    if (!classDecl) return;

    // Find all methods except constructor
    const methods = classDecl.getMethods().filter((m) => m.getName() !== 'constructor');

    for (const method of methods) {
      // Look for direct assignment to this.nodes = or this.edges =
      const stmts = method.getDescendantsOfKind(SyntaxKind.ExpressionStatement);
      for (const stmt of stmts) {
        const text = stmt.getText();
        if (/this\.nodes\s*=\s*(?!\{)/.test(text) || /this\.edges\s*=\s*(?!\[)/.test(text)) {
          ctx.violation(
            `Direct assignment to this.nodes/edges found in ${method.getName()}() — use immutable patterns`
          );
        }
      }
    }
  },
};

export const graphRules = [gwGraph001, gwGraph002, gwGraph003, gwGraph004, gwGraph005];
export default graphRules;
