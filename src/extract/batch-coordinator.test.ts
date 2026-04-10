import { describe, it, expect, beforeEach } from "vitest";
import { BatchCoordinator } from "./batch-coordinator.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

describe("BatchCoordinator", () => {
  let coordinator: BatchCoordinator;

  beforeEach(() => {
    coordinator = new BatchCoordinator();
  });

  describe("assignFiles", () => {
    it("assigns files to a subagent", () => {
      coordinator.assignFiles(["a.ts", "b.ts"], 1);
      const state = coordinator.getState();
      expect(state.assigned_files.get(1)).toEqual(["a.ts", "b.ts"]);
      expect(state.total_files).toBe(2);
    });

    it("accumulates files for same subagent", () => {
      coordinator.assignFiles(["a.ts"], 1);
      coordinator.assignFiles(["b.ts"], 1);
      expect(coordinator.getState().assigned_files.get(1)).toEqual(["a.ts", "b.ts"]);
    });

    it("handles multiple subagents", () => {
      coordinator.assignFiles(["a.ts"], 1);
      coordinator.assignFiles(["b.ts"], 2);
      expect(coordinator.getState().assigned_files.get(1)).toEqual(["a.ts"]);
      expect(coordinator.getState().assigned_files.get(2)).toEqual(["b.ts"]);
    });
  });

  describe("markComplete", () => {
    it("marks a file as completed", () => {
      coordinator.markComplete("a.ts");
      expect(coordinator.getState().completed).toContain("a.ts");
    });

    it("does not duplicate completed files", () => {
      coordinator.markComplete("a.ts");
      coordinator.markComplete("a.ts");
      expect(coordinator.getState().completed.filter(f => f === "a.ts")).toHaveLength(1);
    });
  });

  describe("markFailed", () => {
    it("records failure with reason and error", () => {
      coordinator.markFailed("a.ts", "parse_error", "Syntax error");
      const state = coordinator.getState();
      expect(state.failed).toHaveLength(1);
      expect(state.failed[0]).toMatchObject({
        file: "a.ts",
        reason: "parse_error",
        error: "Syntax error",
      });
    });

    it("does not duplicate failures", () => {
      coordinator.markFailed("a.ts", "parse_error", "Error 1");
      coordinator.markFailed("a.ts", "timeout", "Error 2");
      expect(coordinator.getState().failed.filter(f => f.file === "a.ts")).toHaveLength(1);
    });
  });

  describe("markSkipped", () => {
    it("records skipped file with reason", () => {
      coordinator.markSkipped("binary.bin", "binary");
      const state = coordinator.getState();
      expect(state.skipped).toHaveLength(1);
      expect(state.skipped[0]).toMatchObject({ file: "binary.bin", reason: "binary" });
    });

    it("does not duplicate skips", () => {
      coordinator.markSkipped("a.ts", "unsupported_type");
      coordinator.markSkipped("a.ts", "empty");
      expect(coordinator.getState().skipped.filter(s => s.file === "a.ts")).toHaveLength(1);
    });
  });

  describe("finalize", () => {
    it("sets completed_at timestamp", () => {
      const state = coordinator.finalize();
      expect(state.completed_at).toBeDefined();
      expect(state.completed_at).toBeGreaterThan(0);
    });
  });

  describe("writeState / readState", () => {
    const tmpDir = `/tmp/graphwiki-batch-test-${randomUUID()}`;

    afterEach(async () => {
      try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    it("persists and restores complete state", async () => {
      coordinator.assignFiles(["a.ts", "b.ts"], 1);
      coordinator.markComplete("a.ts");
      coordinator.markFailed("b.ts", "timeout", "Timed out");
      coordinator.finalize();

      await coordinator.writeState(tmpDir);

      const restored = await BatchCoordinator.readState(tmpDir);
      expect(restored).not.toBeNull();
      expect(restored!.completed).toContain("a.ts");
      expect(restored!.failed[0]?.file).toBe("b.ts");
      expect(restored!.total_files).toBe(2);
    });

    it("readState returns null when file not found", async () => {
      const result = await BatchCoordinator.readState("/nonexistent/path");
      expect(result).toBeNull();
    });

    it("writeState creates directory recursively", async () => {
      await coordinator.writeState(`${tmpDir}/nested/deep`);
      const exists = await fs.access(path.join(tmpDir, "nested", "deep", "batch-state.json")).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });
});