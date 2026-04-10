import { describe, it, expect } from "vitest";
import { readFrontmatter, writeFrontmatter } from "./frontmatter.js";

describe("readFrontmatter", () => {
  it("parses frontmatter from content", () => {
    const result = readFrontmatter(`---
title: Hello World
version: 1.0
---

Some content here.`);
    expect(result.data).toMatchObject({ title: "Hello World", version: 1.0 });
    expect(result.content.trim()).toBe("Some content here.");
  });

  it("returns empty data object when no frontmatter", () => {
    const result = readFrontmatter("Plain content without frontmatter.");
    expect(result.data).toEqual({});
    expect(result.content).toBe("Plain content without frontmatter.");
  });

  it("handles YAML boolean values", () => {
    const result = readFrontmatter(`---
enabled: true
disabled: false
---

Content.`);
    expect(result.data).toMatchObject({ enabled: true, disabled: false });
  });

  it("handles nested YAML objects", () => {
    const result = readFrontmatter(`---
config:
  deep:
    nested: true
tags:
  - one
  - two
---

Content.`);
    expect(result.data).toMatchObject({
      config: { deep: { nested: true } },
      tags: ["one", "two"],
    });
  });

  it("handles content-only frontmatter (empty YAML block)", () => {
    const result = readFrontmatter(`---
---

Real content.`);
    expect(result.data).toEqual({});
    expect(result.content.trim()).toBe("Real content.");
  });

  it("handles multiline string values", () => {
    const result = readFrontmatter(`---
description: |
  This is a
  multiline string
  value.
---

Content.`);
    expect(typeof result.data["description"]).toBe("string");
    expect(result.data["description"]).toContain("multiline");
  });
});

describe("writeFrontmatter", () => {
  it("serializes data and content back to frontmatter format", () => {
    const result = writeFrontmatter("Some body content.", { title: "Test", count: 42 });
    expect(result).toContain("title: Test");
    expect(result).toContain("count: 42");
    expect(result).toContain("Some body content.");
    expect(result).toMatch(/^---/);
  });

  it("round-trips through readFrontmatter", () => {
    const original = `---
title: Roundtrip
items:
  - a
  - b
---

The actual content.`;
    const { data, content } = readFrontmatter(original);
    const written = writeFrontmatter(content, data);
    const { data: parsed, content: parsedContent } = readFrontmatter(written);
    expect(parsed).toMatchObject({ title: "Roundtrip", items: ["a", "b"] });
    expect(parsedContent.trim()).toBe("The actual content.");
  });

  it("handles special characters in values", () => {
    const result = writeFrontmatter("content", { message: "Hello: world | pipes" });
    expect(result).toContain("Hello: world | pipes");
  });

  it("handles empty data object", () => {
    const result = writeFrontmatter("plain content", {});
    expect(result).toContain("plain content");
  });
});