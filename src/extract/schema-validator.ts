/**
 * Schema validator — validates LLM extraction output against the expected graph schema.
 * Supports strict mode (reject on first error) and permissive mode (coerce fixable values).
 */

import type { ValidationError, Coercion } from "../types.js";

type ValidationRule = (value: unknown, path: string) => ValidationError | null;

/**
 * Result returned by the validate() function.
 * Note: This is distinct from the ValidationResult type in types.ts (used for refinement).
 */
export interface SchemaValidationResult {
  passed: boolean;
  errors: ValidationError[];
  coerced: boolean;
}

export const COERCION_RULES: Array<{
  path: string;
  condition: (v: unknown) => boolean;
  coerce: (v: unknown) => unknown;
  rule: string;
}> = [
  // String coercion
  {
    path: "$.nodes[*].id",
    condition: (v) => typeof v === "number",
    coerce: (v) => String(v),
    rule: "number_to_string",
  },
  {
    path: "$.nodes[*].label",
    condition: (v) => v === null || v === undefined,
    coerce: () => "(unnamed)",
    rule: "null_to_unnamed",
  },
  // Edge source/target must be strings
  {
    path: "$.edges[*].source",
    condition: (v) => typeof v === "number",
    coerce: (v) => String(v),
    rule: "number_to_string",
  },
  {
    path: "$.edges[*].target",
    condition: (v) => typeof v === "number",
    coerce: (v) => String(v),
    rule: "number_to_string",
  },
  // Relation fallback
  {
    path: "$.edges[*].relation",
    condition: (v) => typeof v !== "string" || v === "",
    coerce: () => "related_to",
    rule: "invalid_to_related_to",
  },
  // Node type fallback
  {
    path: "$.nodes[*].type",
    condition: (v) => typeof v !== "string" || v === "",
    coerce: () => "entity",
    rule: "invalid_to_entity",
  },
  // Confidence level normalization
  {
    path: "$.nodes[*].confidence_level",
    condition: (v) => !["EXTRACTED", "INFERRED", "AMBIGUOUS"].includes(v as string),
    coerce: () => "INFERRED",
    rule: "invalid_confidence_to_inferred",
  },
  {
    path: "$.edges[*].confidence_level",
    condition: (v) => !["EXTRACTED", "INFERRED", "AMBIGUOUS"].includes(v as string),
    coerce: () => "INFERRED",
    rule: "invalid_confidence_to_inferred",
  },
];

// ─── Core validation rules ───────────────────────────────────────────────────

function validateNodes(response: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const obj = response as Record<string, unknown>;

  if (!Array.isArray(obj["nodes"])) {
    errors.push({ path: "$.nodes", message: "nodes must be an array", severity: "error" });
    return errors;
  }

  obj["nodes"].forEach((node: unknown, i: number) => {
    const n = node as Record<string, unknown>;
    if (typeof n["id"] !== "string" || n["id"].trim() === "") {
      errors.push({ path: `$.nodes[${i}].id`, message: "id must be a non-empty string", severity: "error" });
    }
    if (typeof n["type"] !== "string" || n["type"].trim() === "") {
      errors.push({ path: `$.nodes[${i}].type`, message: "type must be a non-empty string", severity: "error" });
    }
    if (typeof n["label"] !== "string") {
      errors.push({ path: `$.nodes[${i}].label`, message: "label must be a string", severity: "error" });
    }
    if (!["EXTRACTED", "INFERRED", "AMBIGUOUS", undefined, null].includes(n["confidence_level"] as string)) {
      errors.push({ path: `$.nodes[${i}].confidence_level`, message: "confidence_level must be EXTRACTED | INFERRED | AMBIGUOUS", severity: "error" });
    }
  });

  return errors;
}

function validateEdges(response: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const obj = response as Record<string, unknown>;

  if (!Array.isArray(obj["edges"])) {
    errors.push({ path: "$.edges", message: "edges must be an array", severity: "error" });
    return errors;
  }

  obj["edges"].forEach((edge: unknown, i: number) => {
    const e = edge as Record<string, unknown>;
    if (typeof e["source"] !== "string" || e["source"].trim() === "") {
      errors.push({ path: `$.edges[${i}].source`, message: "source must be a non-empty string", severity: "error" });
    }
    if (typeof e["target"] !== "string" || e["target"].trim() === "") {
      errors.push({ path: `$.edges[${i}].target`, message: "target must be a non-empty string", severity: "error" });
    }
    if (typeof e["relation"] !== "string" || e["relation"].trim() === "") {
      errors.push({ path: `$.edges[${i}].relation`, message: "relation must be a non-empty string", severity: "error" });
    }
    if (!["EXTRACTED", "INFERRED", "AMBIGUOUS", undefined, null].includes(e["confidence_level"] as string)) {
      errors.push({ path: `$.edges[${i}].confidence_level`, message: "confidence_level must be EXTRACTED | INFERRED | AMBIGUOUS", severity: "error" });
    }
  });

  return errors;
}

function validateDocumentStructure(response: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const obj = response as Record<string, unknown>;

  if (typeof obj["id"] !== "string" || obj["id"].trim() === "") {
    errors.push({ path: "$.id", message: "id must be a non-empty string", severity: "error" });
  }

  return errors;
}

// ─── Strict mode: reject on first error ───────────────────────────────────────

const STRICT_MODE_RULES: ValidationRule[] = [
  (v) => {
    if (v === null || v === undefined) {
      return { path: "$", message: "response must not be null or undefined", severity: "error" };
    }
    return null;
  },
  (v) => {
    if (typeof v !== "object" || Array.isArray(v)) {
      return { path: "$", message: "response must be a plain object", severity: "error" };
    }
    return null;
  },
  (v) => {
    const docErrors = validateDocumentStructure(v);
    return docErrors[0] ?? null;
  },
  (v) => {
    const nodeErrors = validateNodes(v);
    return nodeErrors[0] ?? null;
  },
  (v) => {
    const edgeErrors = validateEdges(v);
    return edgeErrors[0] ?? null;
  },
];

// ─── Permissive mode: coerce fixable values, collect all errors ───────────────

function applyCoercions(response: unknown): { coerced: unknown; coercions: Coercion[] } {
  const coerced = JSON.parse(JSON.stringify(response)); // deep clone
  const coercions: Coercion[] = [];

  for (const rule of COERCION_RULES) {
    applyCoercionRule(coerced, rule, coercions);
  }

  return { coerced, coercions };
}

function applyCoercionRule(
  obj: unknown,
  rule: (typeof COERCION_RULES)[number],
  coercions: Coercion[]
): void {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return;

  const o = obj as Record<string, unknown>;

  // Apply to nodes array
  if (Array.isArray(o["nodes"])) {
    o["nodes"].forEach((node: unknown, i: number) => {
      const n = node as Record<string, unknown>;
      const pathBase = `$.nodes[${i}]`;

      // id coercion
      if (pathBase + ".id" === rule.path || rule.path === "$.nodes[*].id") {
        const idVal = n["id"];
        if (rule.condition(idVal)) {
          const original = n["id"];
          n["id"] = rule.coerce(idVal);
          coercions.push({ path: `${pathBase}.id`, original, coerced: n["id"], rule: rule.rule });
        }
      }
      // label coercion
      if (pathBase + ".label" === rule.path || rule.path === "$.nodes[*].label") {
        const labelVal = n["label"];
        if (rule.condition(labelVal)) {
          const original = n["label"];
          n["label"] = rule.coerce(labelVal);
          coercions.push({ path: `${pathBase}.label`, original, coerced: n["label"], rule: rule.rule });
        }
      }
      // type coercion
      if (pathBase + ".type" === rule.path || rule.path === "$.nodes[*].type") {
        const typeVal = n["type"];
        if (rule.condition(typeVal)) {
          const original = n["type"];
          n["type"] = rule.coerce(typeVal);
          coercions.push({ path: `${pathBase}.type`, original, coerced: n["type"], rule: rule.rule });
        }
      }
      // confidence_level coercion
      if (pathBase + ".confidence_level" === rule.path || rule.path === "$.nodes[*].confidence_level") {
        const confVal = n["confidence_level"];
        if (rule.condition(confVal)) {
          const original = n["confidence_level"];
          n["confidence_level"] = rule.coerce(confVal);
          coercions.push({ path: `${pathBase}.confidence_level`, original, coerced: n["confidence_level"], rule: rule.rule });
        }
      }
    });
  }

  // Apply to edges array
  if (Array.isArray(o["edges"])) {
    o["edges"].forEach((edge: unknown, i: number) => {
      const e = edge as Record<string, unknown>;
      const pathBase = `$.edges[${i}]`;

      if (pathBase + ".source" === rule.path || rule.path === "$.edges[*].source") {
        const val = e["source"];
        if (rule.condition(val)) {
          const original = e["source"];
          e["source"] = rule.coerce(val);
          coercions.push({ path: `${pathBase}.source`, original, coerced: e["source"], rule: rule.rule });
        }
      }
      if (pathBase + ".target" === rule.path || rule.path === "$.edges[*].target") {
        const val = e["target"];
        if (rule.condition(val)) {
          const original = e["target"];
          e["target"] = rule.coerce(val);
          coercions.push({ path: `${pathBase}.target`, original, coerced: e["target"], rule: rule.rule });
        }
      }
      if (pathBase + ".relation" === rule.path || rule.path === "$.edges[*].relation") {
        const val = e["relation"];
        if (rule.condition(val)) {
          const original = e["relation"];
          e["relation"] = rule.coerce(val);
          coercions.push({ path: `${pathBase}.relation`, original, coerced: e["relation"], rule: rule.rule });
        }
      }
      if (pathBase + ".confidence_level" === rule.path || rule.path === "$.edges[*].confidence_level") {
        const val = e["confidence_level"];
        if (rule.condition(val)) {
          const original = e["confidence_level"];
          e["confidence_level"] = rule.coerce(val);
          coercions.push({ path: `${pathBase}.confidence_level`, original, coerced: e["confidence_level"], rule: rule.rule });
        }
      }
    });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validate a raw LLM response against the graph schema.
 * Strict mode: fail on first error.
 * Permissive mode: apply cooercions and return all errors/warnings.
 */
export function validate(response: unknown, mode: "strict" | "permissive"): SchemaValidationResult {
  if (mode === "strict") {
    for (const rule of STRICT_MODE_RULES) {
      const error = rule(response, "$");
      if (error) {
        return { passed: false, errors: [error], coerced: false };
      }
    }
    // Deep validation pass
    const nodeErrors = validateNodes(response);
    if (nodeErrors.length > 0) return { passed: false, errors: [nodeErrors[0]!], coerced: false };
    const edgeErrors = validateEdges(response);
    if (edgeErrors.length > 0) return { passed: false, errors: [edgeErrors[0]!], coerced: false };
    const docErrors = validateDocumentStructure(response);
    if (docErrors.length > 0) return { passed: false, errors: [docErrors[0]!], coerced: false };
    return { passed: true, errors: [], coerced: false };
  }

  // Permissive mode
  const { coerced } = applyCoercions(response);
  const allErrors: ValidationError[] = [];
  const docErrors = validateDocumentStructure(response);
  const nodeErrors = validateNodes(coerced);
  const edgeErrors = validateEdges(coerced);
  allErrors.push(...docErrors, ...nodeErrors, ...edgeErrors);

  return { passed: allErrors.filter(e => e.severity === "error").length === 0, errors: allErrors, coerced: true };
}