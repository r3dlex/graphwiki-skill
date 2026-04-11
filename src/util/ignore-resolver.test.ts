import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveIgnores, type IgnoreSources } from "./ignore-resolver.js";

vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
}));

const { readFile } = await import("fs/promises");

beforeEach(() => {
  vi.resetModules();
  readFile.mockReset();
});

describe("resolveIgnores", () => {
  it("all three sources present -- patterns merged with deduplication", async () => {
    readFile.mockImplementation((path: string) => {
      const p = path.toString();
      if (p.endsWith(".graphwiki/config.json")) {
        return Promise.resolve(JSON.stringify({ extraction: { ignore_patterns: ["foo/", "bar/"] } }));
      }
      if (p.endsWith(".graphwikiignore")) {
        return Promise.resolve("foo/\nbaz/\n# comment\n\nqux/\n");
      }
      if (p.endsWith(".graphifyignore")) {
        return Promise.resolve("foo/\nquux/\n");
      }
      return Promise.reject(new Error("unexpected path: " + p));
    });

    const [patterns, sources] = await resolveIgnores("/fake/project");

    expect(patterns).toContain("foo/");
    expect(patterns).toContain("bar/");
    expect(patterns).toContain("baz/");
    expect(patterns).toContain("qux/");
    expect(patterns).toContain("quux/");
    // foo/ appears twice across sources but should appear only once (dedup)
    const fooCount = patterns.filter((p) => p === "foo/").length;
    expect(fooCount).toBe(1);

    expect(sources.configJson).toEqual(["foo/", "bar/"]);
    expect(sources.graphwikiignore).toEqual(["foo/", "baz/", "qux/"]);
    expect(sources.graphifyignore).toEqual(["foo/", "quux/"]);
  });

  it("missing .graphwikiignore -- returns patterns from config.json + .graphifyignore", async () => {
    readFile.mockImplementation((path: string) => {
      const p = path.toString();
      if (p.endsWith(".graphwiki/config.json")) {
        return Promise.resolve(JSON.stringify({ extraction: { ignore_patterns: ["a/", "b/"] } }));
      }
      if (p.endsWith(".graphwikiignore")) {
        return Promise.reject(new Error("ENOENT"));
      }
      if (p.endsWith(".graphifyignore")) {
        return Promise.resolve("c/\n");
      }
      return Promise.reject(new Error("unexpected path: " + p));
    });

    const [patterns, sources] = await resolveIgnores("/fake/project");

    expect(patterns).toEqual(["a/", "b/", "c/"]);
    expect(sources.graphwikiignore).toEqual([]);
  });

  it("missing .graphifyignore -- returns patterns from config.json + .graphwikiignore", async () => {
    readFile.mockImplementation((path: string) => {
      const p = path.toString();
      if (p.endsWith(".graphwiki/config.json")) {
        return Promise.resolve(JSON.stringify({ extraction: { ignore_patterns: ["x/"] } }));
      }
      if (p.endsWith(".graphwikiignore")) {
        return Promise.resolve("y/\n");
      }
      if (p.endsWith(".graphifyignore")) {
        return Promise.reject(new Error("ENOENT"));
      }
      return Promise.reject(new Error("unexpected path: " + p));
    });

    const [patterns, sources] = await resolveIgnores("/fake/project");

    expect(patterns).toEqual(["x/", "y/"]);
    expect(sources.graphifyignore).toEqual([]);
  });

  it("config.json exists but is malformed JSON -- graceful degradation returns patterns from both ignore files", async () => {
    readFile.mockImplementation((path: string) => {
      const p = path.toString();
      if (p.endsWith(".graphwiki/config.json")) {
        return Promise.resolve("{ invalid json }");
      }
      if (p.endsWith(".graphwikiignore")) {
        return Promise.resolve("a/\n");
      }
      if (p.endsWith(".graphifyignore")) {
        return Promise.resolve("b/\n");
      }
      return Promise.reject(new Error("unexpected path: " + p));
    });

    const [patterns, sources] = await resolveIgnores("/fake/project");

    expect(patterns).toEqual(["a/", "b/"]);
    expect(sources.configJson).toEqual([]);
  });

  it("missing config.json (or missing extraction.ignore_patterns key) -- returns patterns from both ignore files", async () => {
    readFile.mockImplementation((path: string) => {
      const p = path.toString();
      if (p.endsWith(".graphwiki/config.json")) {
        return Promise.reject(new Error("ENOENT"));
      }
      if (p.endsWith(".graphwikiignore")) {
        return Promise.resolve("p1/\n");
      }
      if (p.endsWith(".graphifyignore")) {
        return Promise.resolve("p2/\n");
      }
      return Promise.reject(new Error("unexpected path: " + p));
    });

    const [patterns, sources] = await resolveIgnores("/fake/project");

    expect(patterns).toEqual(["p1/", "p2/"]);
    expect(sources.configJson).toEqual([]);
  });

  it("comments (# ...) and blank lines are stripped from file-based ignores", async () => {
    readFile.mockImplementation((path: string) => {
      const p = path.toString();
      if (p.endsWith(".graphwiki/config.json")) {
        return Promise.resolve(JSON.stringify({ extraction: { ignore_patterns: ["config/"] } }));
      }
      if (p.endsWith(".graphwikiignore")) {
        return Promise.resolve("# full-line comment\n  \npattern1/\n#inline comment here\npattern2/\n\n\n# another comment\n");
      }
      if (p.endsWith(".graphifyignore")) {
        return Promise.resolve("\n# only comments\n\n   \n# more comments\n");
      }
      return Promise.reject(new Error("unexpected path: " + p));
    });

    const [patterns] = await resolveIgnores("/fake/project");

    expect(patterns).not.toContain("# full-line comment");
    expect(patterns).not.toContain("#inline comment here");
    expect(patterns).not.toContain("# another comment");
    expect(patterns).toContain("pattern1/");
    expect(patterns).toContain("pattern2/");
    expect(patterns).toContain("config/");
  });

  it("deduplication -- identical patterns from multiple sources appear only once", async () => {
    readFile.mockImplementation((path: string) => {
      const p = path.toString();
      if (p.endsWith(".graphwiki/config.json")) {
        return Promise.resolve(JSON.stringify({ extraction: { ignore_patterns: ["dup/", "unique1/"] } }));
      }
      if (p.endsWith(".graphwikiignore")) {
        return Promise.resolve("dup/\nunique2/\n");
      }
      if (p.endsWith(".graphifyignore")) {
        return Promise.resolve("dup/\nunique3/\n");
      }
      return Promise.reject(new Error("unexpected path: " + p));
    });

    const [patterns] = await resolveIgnores("/fake/project");

    const dupCount = patterns.filter((p) => p === "dup/").length;
    expect(dupCount).toBe(1);
    expect(patterns).toContain("unique1/");
    expect(patterns).toContain("unique2/");
    expect(patterns).toContain("unique3/");
  });
});
