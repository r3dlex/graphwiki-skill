import { describe, it, expect, vi, beforeEach } from "vitest";
import { ONNXEmbedding } from "./embedding.js";

describe("ONNXEmbedding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("cosineSimilarity", () => {
    it("should compute cosine similarity correctly", () => {
      const a = [1, 0, 0];
      const b = [1, 0, 0];
      expect(ONNXEmbedding.cosineSimilarity(a, b)).toBeCloseTo(1);

      const c = [1, 0, 0];
      const d = [0, 1, 0];
      expect(ONNXEmbedding.cosineSimilarity(c, d)).toBeCloseTo(0);

      const e = [1, 2, 3];
      const f = [4, 5, 6];
      const sim = ONNXEmbedding.cosineSimilarity(e, f);
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });

    it("should throw on dimension mismatch", () => {
      expect(() => ONNXEmbedding.cosineSimilarity([1, 2], [1])).toThrow();
    });

    it("should handle zero vectors", () => {
      expect(ONNXEmbedding.cosineSimilarity([0, 0], [1, 1])).toBe(0);
    });
  });

  describe("loadModel", () => {
    it("should create an ONNXEmbedding instance", () => {
      const embedding = new ONNXEmbedding();
      expect(embedding.getDimension()).toBe(384);
    });
  });
});
