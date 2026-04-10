import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { computeDelta, persistDelta } from "./delta.js";
import type { GraphDocument } from "../types.js";
import { unlinkSync, existsSync } from "fs";

describe("computeDelta", () => {
  it("should detect added nodes", () => {
    const oldGraph: GraphDocument = { nodes: [], edges: [] };
    const newGraph: GraphDocument = {
      nodes: [{ id: "n1", label: "New", type: "class" }],
      edges: [],
    };
    const delta = computeDelta(oldGraph, newGraph);
    expect(delta.added.nodes.length).toBe(1);
    expect(delta.added.nodes[0].id).toBe("n1");
  });

  it("should detect removed nodes", () => {
    const oldGraph: GraphDocument = {
      nodes: [{ id: "n1", label: "Old", type: "class" }],
      edges: [],
    };
    const newGraph: GraphDocument = { nodes: [], edges: [] };
    const delta = computeDelta(oldGraph, newGraph);
    expect(delta.removed.nodes.length).toBe(1);
    expect(delta.removed.nodes[0].id).toBe("n1");
  });

  it("should detect modified nodes", () => {
    const oldGraph: GraphDocument = {
      nodes: [{ id: "n1", label: "Old", type: "class", properties: { v: 1 } }],
      edges: [],
    };
    const newGraph: GraphDocument = {
      nodes: [{ id: "n1", label: "New", type: "class", properties: { v: 2 } }],
      edges: [],
    };
    const delta = computeDelta(oldGraph, newGraph);
    expect(delta.modified.length).toBe(1);
    expect(delta.modified[0].label).toBe("New");
  });

  it("should identify unchanged nodes", () => {
    const node = { id: "n1", label: "Same", type: "class" };
    const oldGraph: GraphDocument = { nodes: [node], edges: [] };
    const newGraph: GraphDocument = { nodes: [{ ...node }], edges: [] };
    const delta = computeDelta(oldGraph, newGraph);
    expect(delta.unchanged).toContain("n1");
    expect(delta.modified).toHaveLength(0);
  });

  it("should detect added edges", () => {
    const oldGraph: GraphDocument = {
      nodes: [
        { id: "a", label: "A", type: "class" },
        { id: "b", label: "B", type: "class" },
      ],
      edges: [],
    };
    const newGraph: GraphDocument = {
      nodes: [
        { id: "a", label: "A", type: "class" },
        { id: "b", label: "B", type: "class" },
      ],
      edges: [{ id: "e1", source: "a", target: "b", weight: 1 }],
    };
    const delta = computeDelta(oldGraph, newGraph);
    expect(delta.added.edges.length).toBe(1);
  });

  it("should detect removed edges", () => {
    const oldGraph: GraphDocument = {
      nodes: [
        { id: "a", label: "A", type: "class" },
        { id: "b", label: "B", type: "class" },
      ],
      edges: [{ id: "e1", source: "a", target: "b", weight: 1 }],
    };
    const newGraph: GraphDocument = {
      nodes: [
        { id: "a", label: "A", type: "class" },
        { id: "b", label: "B", type: "class" },
      ],
      edges: [],
    };
    const delta = computeDelta(oldGraph, newGraph);
    expect(delta.removed.edges.length).toBe(1);
  });
});

describe("persistDelta", () => {
  const tmpDir = "/tmp/delta-test-out";

  beforeEach(() => {
    // cleanup
    if (existsSync(tmpDir)) {
      const files = require("fs").readdirSync(tmpDir);
      files.forEach((f: string) => unlinkSync(`${tmpDir}/${f}`));
    }
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      const files = require("fs").readdirSync(tmpDir);
      files.forEach((f: string) => unlinkSync(`${tmpDir}/${f}`));
      require("fs").rmdirSync(tmpDir);
    }
  });

  it("should write delta to timestamped file", () => {
    const delta = computeDelta({ nodes: [], edges: [] }, { nodes: [], edges: [] });
    persistDelta(delta, tmpDir);

    const files = require("fs").readdirSync(tmpDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/\.delta\.json$/);
  });

  it("should write valid JSON", () => {
    const oldGraph: GraphDocument = {
      nodes: [{ id: "a", label: "A", type: "class" }],
      edges: [],
    };
    const delta = computeDelta(oldGraph, { nodes: [], edges: [] });
    persistDelta(delta, tmpDir);

    const files = require("fs").readdirSync(tmpDir);
    const content = require("fs").readFileSync(`${tmpDir}/${files[0]}`, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.removed.nodes).toHaveLength(1);
  });
});
