import { Rule } from 'archgate';
import { Project, SyntaxKind } from 'ts-morph';

export const gwDedup001: Rule = {
  id: 'gw-dedup-001',
  name: 'ONNX model single initialization',
  severity: 'error',
  scope: 'src/dedup/',
  assert: (ctx) => {
    const project = new Project({ tsConfigFilePath: './tsconfig.json' });
    const embedding = project.getSourceFile('src/dedup/embedding.ts');
    if (!embedding) return;

    const classDecl = embedding.getClass('ONNXEmbedding');
    if (!classDecl) return;

    const onnxModelAssignments = classDecl
      .getDescendantsOfKind(SyntaxKind.PropertyAssignment)
      .filter((pa) => {
        const name = pa.getNameNode().getText();
        return name === 'onnxModel' || name === 'session';
      });

    if (onnxModelAssignments.length > 1) {
      ctx.violation('ONNX model must only be initialized once — multiple assignments found');
    }
  },
};

export const gwDedup002: Rule = {
  id: 'gw-dedup-002',
  name: 'Batch size invariant',
  severity: 'error',
  scope: 'src/dedup/',
  assert: (ctx) => {
    const project = new Project({ tsConfigFilePath: './tsconfig.json' });
    const embedding = project.getSourceFile('src/dedup/embedding.ts');
    if (!embedding) return;

    const classDecl = embedding.getClass('ONNXEmbedding');
    if (!classDecl) return;

    const embedMethod = classDecl.getMethod('embed');
    if (!embedMethod) return;

    const batchSizeDecls = embedMethod
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .filter((vd) => vd.getName() === 'BATCH_SIZE');

    if (batchSizeDecls.length === 0) {
      ctx.violation('BATCH_SIZE variable not found in embed() method');
      return;
    }

    const batchSizeDecl = batchSizeDecls[0]!;
    const initializer = batchSizeDecl.getInitializer();
    if (!initializer) {
      ctx.violation('BATCH_SIZE has no initializer');
      return;
    }

    if (initializer.getKind() !== SyntaxKind.NumericLiteral || initializer.getText() !== '32') {
      ctx.violation('BATCH_SIZE must be 32 (NumericLiteral), found: ' + initializer.getText());
    }
  },
};

export const gwDedup003: Rule = {
  id: 'gw-dedup-003',
  name: 'Dimension invariant',
  severity: 'error',
  scope: 'src/dedup/',
  assert: (ctx) => {
    const project = new Project({ tsConfigFilePath: './tsconfig.json' });
    const embedding = project.getSourceFile('src/dedup/embedding.ts');
    if (!embedding) return;

    const classDecl = embedding.getClass('ONNXEmbedding');
    if (!classDecl) return;

    const dimProp = classDecl.getProperty('dimension');
    if (!dimProp) {
      ctx.violation('dimension property not found in ONNXEmbedding');
      return;
    }

    const initializer = dimProp.getInitializer();
    if (!initializer) {
      ctx.violation('dimension property has no initializer');
      return;
    }

    if (initializer.getKind() !== SyntaxKind.NumericLiteral || initializer.getText() !== '384') {
      ctx.violation('dimension must be 384 for all-MiniLM-L6-v2 — found: ' + initializer.getText());
    }
  },
};

export const gwDedup004: Rule = {
  id: 'gw-dedup-004',
  name: 'Similarity threshold bounds',
  severity: 'error',
  scope: 'src/dedup/',
  assert: (ctx) => {
    const project = new Project({ tsConfigFilePath: './tsconfig.json' });
    const dedup = project.getSourceFile('src/dedup/deduplicator.ts');
    if (!dedup) return;

    const classDecl = dedup.getClass('Deduplicator');
    if (!classDecl) return;

    const findMerges = classDecl.getMethod('_findMerges');
    if (!findMerges) return;

    const text = findMerges.getText();
    if ((text.includes('context_boost') || text.includes('effectiveSim')) && !text.includes('Math.min(1')) {
      ctx.violation('Context boost must be clamped with Math.min(1, ...) before use in division — ADR-004');
    }
  },
};

export const gwDedup005: Rule = {
  id: 'gw-dedup-005',
  name: 'No lossy equality checks',
  severity: 'error',
  scope: 'src/dedup/',
  assert: (ctx) => {
    const project = new Project({ tsConfigFilePath: './tsconfig.json' });
    const math = project.getSourceFile('src/util/math.ts');
    if (!math) return;

    const fn = math.getFunction('cosineSimilarity');
    if (!fn) return;

    const zeroChecks = fn
      .getDescendantsOfKind(SyntaxKind.BinaryExpression)
      .filter((be) => {
        const opKind = be.getOperatorToken().getKind();
        const isZeroCheck =
          (opKind === SyntaxKind.EqualsEqualsToken ||
            opKind === SyntaxKind.EqualsEqualsEqualsToken) &&
          be.getRight().getText() === '0';
        return isZeroCheck;
      });

    if (zeroChecks.length === 0) {
      ctx.violation('cosineSimilarity must check denominator !== 0 before division — no zero-check found');
    }
  },
};

export const dedupRules = [gwDedup001, gwDedup002, gwDedup003, gwDedup004, gwDedup005];
export default dedupRules;
