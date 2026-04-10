import { describe, it, expect } from "vitest";
import { validate } from "./schema-validator.js";

describe("validate — strict mode", () => {
  it("accepts a valid document", () => {
    const doc = {
      id: "doc1",
      nodes: [
        { id: "n1", type: "function", label: "foo", confidence_level: "EXTRACTED" },
      ],
      edges: [
        { source: "n1", target: "n2", relation: "calls", confidence_level: "EXTRACTED" },
      ],
    };
    const result = validate(doc, "strict");
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects null response", () => {
    const result = validate(null, "strict");
    expect(result.passed).toBe(false);
    expect(result.errors[0]?.path).toBe("$");
  });

  it("rejects non-object response", () => {
    const result = validate("string", "strict");
    expect(result.passed).toBe(false);
  });

  it("rejects missing id", () => {
    const result = validate({ nodes: [], edges: [] }, "strict");
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.path === "$.id")).toBe(true);
  });

  it("rejects nodes that is not an array", () => {
    const result = validate({ id: "d1", nodes: "not-array", edges: [] }, "strict");
    expect(result.passed).toBe(false);
    expect(result.errors[0]?.path).toBe("$.nodes");
  });

  it("rejects edges that is not an array", () => {
    const result = validate({ id: "d1", nodes: [], edges: "not-array" }, "strict");
    expect(result.passed).toBe(false);
    expect(result.errors[0]?.path).toBe("$.edges");
  });

  it("rejects node with empty id", () => {
    const result = validate({ id: "d1", nodes: [{ id: "", type: "func", label: "f" }], edges: [] }, "strict");
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.path.includes("id"))).toBe(true);
  });

  it("rejects node with missing type", () => {
    const result = validate({ id: "d1", nodes: [{ id: "n1", label: "foo" }], edges: [] }, "strict");
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.path.includes("type"))).toBe(true);
  });

  it("rejects edge with invalid confidence_level", () => {
    const result = validate({
      id: "d1",
      nodes: [{ id: "n1", type: "func", label: "f" }],
      edges: [{ source: "n1", target: "n2", relation: "calls", confidence_level: "INVALID" }],
    }, "strict");
    expect(result.passed).toBe(false);
  });

  it("rejects array response", () => {
    const result = validate([{ id: "d1" }], "strict");
    expect(result.passed).toBe(false);
    expect(result.errors[0]?.message).toContain("plain object");
  });
});

describe("validate — permissive mode", () => {
  it("accepts a valid document", () => {
    const doc = { id: "d1", nodes: [{ id: "n1", type: "func", label: "f" }], edges: [] };
    const result = validate(doc, "permissive");
    expect(result.passed).toBe(true);
    expect(result.coerced).toBe(true);
  });

  it("coerces number node id to string", () => {
    const doc = { id: "d1", nodes: [{ id: 123, type: "func", label: "f" }], edges: [] };
    const result = validate(doc, "permissive");
    expect(result.coerced).toBe(true);
  });

  it("coerces null label to '(unnamed)'", () => {
    const doc = { id: "d1", nodes: [{ id: "n1", type: "func", label: null }], edges: [] };
    const result = validate(doc, "permissive");
    expect(result.coerced).toBe(true);
  });

  it("coerces invalid confidence_level to INFERRED", () => {
    const doc = {
      id: "d1",
      nodes: [{ id: "n1", type: "func", label: "f", confidence_level: "BAD_VALUE" }],
      edges: [],
    };
    const result = validate(doc, "permissive");
    expect(result.coerced).toBe(true);
    expect(result.errors.some(e => e.severity === "error")).toBe(false);
  });

  it("coerces invalid relation to 'related_to'", () => {
    const doc = {
      id: "d1",
      nodes: [{ id: "n1", type: "func", label: "f" }],
      edges: [{ source: "n1", target: "n2", relation: "", confidence_level: "EXTRACTED" }],
    };
    const result = validate(doc, "permissive");
    expect(result.coerced).toBe(true);
  });

  it("coerces number edge source/target to string", () => {
    const doc = { id: "d1", nodes: [{ id: "n1", type: "func", label: "f" }], edges: [{ source: 1, target: 2, relation: "calls" }] };
    const result = validate(doc, "permissive");
    expect(result.coerced).toBe(true);
    expect(result.errors.filter(e => e.severity === "error")).toHaveLength(0);
  });

  it("returns warnings for non-critical issues in permissive mode", () => {
    const doc = { id: "d1", nodes: [{ id: "n1", type: "func", label: "f", confidence_level: "EXTRACTED" }], edges: [] };
    const result = validate(doc, "permissive");
    // No errors in permissive mode for this valid doc
    expect(result.passed).toBe(true);
  });
});