import { describe, it, expect } from "vitest";
import { detectFileType, detectLanguage, SUPPORTED_LANGUAGES, EXTRACTOR_PATH } from "./detector.js";

describe("detectFileType", () => {
  it("detects TypeScript as code", () => {
    expect(detectFileType("src/utils/helpers.ts")).toBe("code");
  });

  it("detects JavaScript as code", () => {
    expect(detectFileType("lib/index.js")).toBe("code");
  });

  it("detects Python as code", () => {
    expect(detectFileType("scripts/build.py")).toBe("code");
  });

  it("detects markdown", () => {
    expect(detectFileType("docs/API.md")).toBe("markdown");
  });

  it("detects pdf", () => {
    expect(detectFileType("paper.pdf")).toBe("pdf");
  });

  it("detects docx", () => {
    expect(detectFileType("report.docx")).toBe("docx");
  });

  it("detects pptx", () => {
    expect(detectFileType("slides.pptx")).toBe("pptx");
  });

  it("detects images", () => {
    expect(detectFileType("screenshot.png")).toBe("image");
    expect(detectFileType("photo.jpg")).toBe("image");
    expect(detectFileType("diagram.webp")).toBe("image");
  });

  it("detects rtf", () => {
    expect(detectFileType("notes.rtf")).toBe("rtf");
  });

  it("returns unsupported for unknown extensions", () => {
    expect(detectFileType("data.xyz")).toBe("unsupported");
  });

  it("handles uppercase extensions", () => {
    expect(detectFileType("MAIN.TS")).toBe("code");
  });
});

describe("detectLanguage", () => {
  it("returns TypeScript for .ts", () => {
    expect(detectLanguage("file.ts")).toBe("TypeScript");
  });

  it("returns JavaScript for .js", () => {
    expect(detectLanguage("file.js")).toBe("JavaScript");
  });

  it("returns Python for .py", () => {
    expect(detectLanguage("file.py")).toBe("Python");
  });

  it("returns Go for .go", () => {
    expect(detectLanguage("file.go")).toBe("Go");
  });

  it("returns Rust for .rs", () => {
    expect(detectLanguage("file.rs")).toBe("Rust");
  });

  it("returns null for unknown extensions", () => {
    expect(detectLanguage("file.xyz")).toBe(null);
  });

  it("handles uppercase extensions", () => {
    expect(detectLanguage("file.PY")).toBe("Python");
  });
});

describe("SUPPORTED_LANGUAGES", () => {
  it("contains all major languages", () => {
    const langs = Object.values(SUPPORTED_LANGUAGES);
    expect(langs).toContain("TypeScript");
    expect(langs).toContain("JavaScript");
    expect(langs).toContain("Python");
    expect(langs).toContain("Go");
    expect(langs).toContain("Rust");
    expect(langs).toContain("Java");
    expect(langs).toContain("C");
    expect(langs).toContain("C++");
    expect(langs).toContain("C#");
    expect(langs).toContain("Ruby");
    expect(langs).toContain("PHP");
    expect(langs).toContain("Swift");
    expect(langs).toContain("Bash");
    expect(langs).toContain("Elixir");
  });
});

describe("EXTRACTOR_PATH", () => {
  it("maps source files to ast extractor", () => {
    expect(EXTRACTOR_PATH[".ts"]).toBe("ast");
    expect(EXTRACTOR_PATH[".py"]).toBe("ast");
    expect(EXTRACTOR_PATH[".go"]).toBe("ast");
    expect(EXTRACTOR_PATH[".rs"]).toBe("ast");
  });

  it("maps markdown to frontmatter extractor", () => {
    expect(EXTRACTOR_PATH[".md"]).toBe("frontmatter");
    expect(EXTRACTOR_PATH[".mdx"]).toBe("frontmatter");
  });

  it("maps pdf/docx to model_native extractor", () => {
    expect(EXTRACTOR_PATH[".pdf"]).toBe("model_native");
    expect(EXTRACTOR_PATH[".docx"]).toBe("model_native");
    expect(EXTRACTOR_PATH[".pptx"]).toBe("model_native");
  });
});