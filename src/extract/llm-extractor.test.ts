import { describe, it, expect, afterEach } from "vitest";
import { LLMExtractor } from "./llm-extractor.js";
import type { LLMProvider } from "../types.js";
import * as fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

const makeProvider = (response: string, fail = false): LLMProvider =>
  ({
    complete: async () => { if (fail) throw new Error("Provider error"); return { content: response }; },
    completeMessages: async () => { if (fail) throw new Error("Provider error"); return { content: response }; },
    getTokenizer: () => ({
      encode: async () => [1, 2, 3],
      decode: async () => "decoded",
      tokenCount: async () => 3,
    }),
  } as unknown as LLMProvider);

const validDoc = {
  id: "doc1",
  nodes: [
    { id: "n1", type: "function", label: "foo", confidence_level: "EXTRACTED" },
  ],
  edges: [
    { id: "e1", source: "n1", target: "n2", relation: "calls", confidence_level: "EXTRACTED" },
  ],
};

describe("LLMExtractor", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs) {
      try { await fs.rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    tmpDirs.length = 0;
  });

  function tmpCacheDir(): string {
    const dir = `/tmp/graphwiki-llm-test-${randomUUID()}`;
    tmpDirs.push(dir);
    return dir;
  }

  it("caches successful extraction and returns cache_hit=true on second call", async () => {
    const provider = makeProvider(JSON.stringify(validDoc));
    const cacheDir = tmpCacheDir();
    const extractor = new LLMExtractor({ provider, cacheDir });

    const content = Buffer.from("def foo(): pass");
    const r1 = await extractor.extract(content, "python", "test.py");
    expect(r1.cache_hit).toBe(false);

    const r2 = await extractor.extract(content, "python", "test.py");
    expect(r2.cache_hit).toBe(true);
  });

  it("updates batch state on completion", async () => {
    const provider = makeProvider(JSON.stringify(validDoc));
    const cacheDir = tmpCacheDir();
    const extractor = new LLMExtractor({ provider, cacheDir });

    const content = Buffer.from("code");
    await extractor.extract(content, "python", "test.py");

    const state = extractor.getBatchState();
    expect(state.completed).toContain("test.py");
  });

  it("records failure when LLM throws", async () => {
    const provider = makeProvider("", true);
    const cacheDir = tmpCacheDir();
    const extractor = new LLMExtractor({ provider, cacheDir });

    await expect(
      extractor.extract(Buffer.from("code"), "python", "test.py")
    ).rejects.toThrow();

    const state = extractor.getBatchState();
    expect(state.failed.length).toBeGreaterThan(0);
  });

  it("parses JSON response correctly", async () => {
    const provider = makeProvider(JSON.stringify(validDoc));
    const cacheDir = tmpCacheDir();
    const extractor = new LLMExtractor({ provider, cacheDir });

    const result = await extractor.extract(Buffer.from("code"), "python", "test.py");
    expect(result.document.id).toBe("doc1");
    expect(result.document.nodes).toHaveLength(1);
  });

  it("strips markdown code fences from response", async () => {
    const provider = makeProvider("```json\n" + JSON.stringify(validDoc) + "\n```");
    const cacheDir = tmpCacheDir();
    const extractor = new LLMExtractor({ provider, cacheDir });

    const result = await extractor.extract(Buffer.from("code"), "python", "test.py");
    expect(result.document.id).toBe("doc1");
  });

  it("marks file as skipped when JSON parse fails", async () => {
    const provider = makeProvider("not valid json at all");
    const cacheDir = tmpCacheDir();
    const extractor = new LLMExtractor({ provider, cacheDir });

    await expect(
      extractor.extract(Buffer.from("code"), "python", "test.py")
    ).rejects.toThrow();

    const state = extractor.getBatchState();
    expect(state.failed.some(f => f.file === "test.py" && f.reason === "invalid_output")).toBe(true);
  });

  it("extractBatch processes all files", async () => {
    const provider = makeProvider(JSON.stringify(validDoc));
    const cacheDir = tmpCacheDir();
    const extractor = new LLMExtractor({ provider, cacheDir });

    const files = [
      { path: "a.py", content: Buffer.from("a"), type: "python" },
      { path: "b.py", content: Buffer.from("b"), type: "python" },
    ];

    await extractor.extractBatch(files);
    const state = extractor.getBatchState();
    expect(state.completed).toContain("a.py");
    expect(state.completed).toContain("b.py");
  });

  it("uses permissive mode by default", async () => {
    const provider = makeProvider(JSON.stringify(validDoc));
    const cacheDir = tmpCacheDir();
    const extractor = new LLMExtractor({ provider, cacheDir });

    const result = await extractor.extract(Buffer.from("code"), "python", "test.py");
    expect(result.document).toBeDefined();
  });

  it("returns cache_hit=false when content is not in cache", async () => {
    const provider = makeProvider(JSON.stringify(validDoc));
    const cacheDir = tmpCacheDir();
    const extractor = new LLMExtractor({ provider, cacheDir });

    const r = await extractor.extract(Buffer.from("unique content " + randomUUID()), "python", "new.py");
    expect(r.cache_hit).toBe(false);
  });

  it("deep mode uses a different (more aggressive) prompt than standard mode", async () => {
    const capturedMessages: Array<Array<{ role: string; content: string }>> = [];
    const capturingProvider: LLMProvider = {
      complete: async (messages) => {
        capturedMessages.push(messages as Array<{ role: string; content: string }>);
        return { content: JSON.stringify(validDoc) };
      },
      completeMessages: async (messages) => {
        capturedMessages.push(messages as Array<{ role: string; content: string }>);
        return { content: JSON.stringify(validDoc) };
      },
      getTokenizer: () => ({
        encode: async () => [1, 2, 3],
        decode: async () => "decoded",
        tokenCount: async () => 3,
      }),
    } as unknown as LLMProvider;

    const standardExtractor = new LLMExtractor({ provider: capturingProvider, cacheDir: tmpCacheDir(), mode: 'standard' });
    await standardExtractor.extract(Buffer.from("code standard"), "python", "standard.py");
    const standardPrompt = capturedMessages[0]?.find(m => m.role === "system")?.content ?? "";

    const deepExtractor = new LLMExtractor({ provider: capturingProvider, cacheDir: tmpCacheDir(), mode: 'deep' });
    await deepExtractor.extract(Buffer.from("code deep"), "python", "deep.py");
    const deepPrompt = capturedMessages[1]?.find(m => m.role === "system")?.content ?? "";

    expect(deepPrompt).not.toBe(standardPrompt);
    expect(deepPrompt.toLowerCase()).toContain("deep");
    expect(deepPrompt.toLowerCase()).toContain("speculative");
    expect(deepPrompt.toLowerCase()).toContain("ambiguous");
  });
});