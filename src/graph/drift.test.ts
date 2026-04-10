import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DriftDetector } from "./drift.js";
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

describe("DriftDetector", () => {
  const tmpPath = "/tmp/drift-test-log.json";
  beforeEach(() => {
    if (existsSync(tmpPath)) unlinkSync(tmpPath);
  });
  afterEach(() => {
    if (existsSync(tmpPath)) unlinkSync(tmpPath);
  });

  it("should detect no drift on first run", () => {
    const detector = new DriftDetector({
      drift_threshold: 0.2,
      max_scoped_runs: 5,
      logPath: tmpPath,
    });
    const prev: Map<string, number> = new Map();
    const next: Map<string, number> = new Map([["a", 1], ["b", 1]]);
    const affected = new Set<string>(["a", "b"]);

    const entry = detector.detect(prev, next, affected);
    expect(entry.drifted_nodes.length).toBe(0);
  });

  it("should detect drifted nodes between runs", () => {
    const detector = new DriftDetector({
      drift_threshold: 0.2,
      max_scoped_runs: 5,
      logPath: tmpPath,
    });
    const prev = new Map<string, number>([["a", 1], ["b", 1], ["c", 1]]);
    const next = new Map<string, number>([["a", 2], ["b", 1], ["c", 1]]);
    const affected = new Set<string>(["a", "b", "c"]);

    const entry = detector.detect(prev, next, affected);
    expect(entry.drifted_nodes).toContain("a");
    expect(entry.drifted_nodes.length).toBe(1);
  });

  it("should increment run count", () => {
    const detector = new DriftDetector({
      drift_threshold: 0.2,
      max_scoped_runs: 5,
      logPath: tmpPath,
    });
    expect(detector.getRunCount()).toBe(0);

    const prev = new Map<string, number>();
    const next = new Map<string, number>([["a", 1]]);
    detector.detect(prev, next, new Set());
    expect(detector.getRunCount()).toBe(1);

    detector.detect(prev, next, new Set());
    expect(detector.getRunCount()).toBe(2);
  });

  it("should reset run count", () => {
    const detector = new DriftDetector({
      drift_threshold: 0.2,
      max_scoped_runs: 5,
      logPath: tmpPath,
    });
    const prev = new Map<string, number>();
    const next = new Map<string, number>([["a", 1]]);
    detector.detect(prev, next, new Set());
    detector.detect(prev, next, new Set());
    expect(detector.getRunCount()).toBe(2);

    detector.reset();
    expect(detector.getRunCount()).toBe(0);
  });

  it("should persist log to file", () => {
    const detector = new DriftDetector({
      drift_threshold: 0.1,
      max_scoped_runs: 3,
      logPath: tmpPath,
    });
    const prev = new Map<string, number>();
    const next = new Map<string, number>([["a", 1]]);
    detector.detect(prev, next, new Set(["a"]));

    expect(existsSync(tmpPath)).toBe(true);
    const content = require("fs").readFileSync(tmpPath, "utf-8");
    const logs = JSON.parse(content);
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBeGreaterThan(0);
  });
});
