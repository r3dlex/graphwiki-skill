import { describe, it, expect } from "vitest";
import { ASTExtractor } from "./ast-extractor.js";

describe("ASTExtractor", () => {
  const extractor = new ASTExtractor();

  describe("extract", () => {
    it("extracts nodes from Python source", async () => {
      const code = `
def greet(name: str) -> str:
    """Return a greeting."""
    return f"Hello, {name}"

def farewell(name: str) -> str:
    return f"Goodbye, {name}"
`;
      const result = await extractor.extract(code, "python", "greeter.py");
      expect(result.nodes.length).toBeGreaterThanOrEqual(1);
    });

    it("extracts nodes from TypeScript source", async () => {
      const code = `
class Greeter {
    name: string;
    constructor(name: string) {
        this.name = name;
    }
    greet(): string {
        return \`Hello, \${this.name}\`;
    }
}
`;
      const result = await extractor.extract(code, "typescript", "Greeter.ts");
      expect(result.nodes.length).toBeGreaterThanOrEqual(1);
    });

    it("returns at least one module node for any language", async () => {
      const result = await extractor.extract("def f(): pass", "python", "test.py");
      expect(result.nodes.some(n => n.type === "module")).toBe(true);
    });

    it("produces edges with confidence EXTRACTED", async () => {
      const code = `
def outer():
    def inner():
        pass
    return inner
`;
      const result = await extractor.extract(code, "python", "nested.py");
      for (const edge of result.edges) {
        expect((edge as Record<string, unknown>).confidence_level).toBe("EXTRACTED");
      }
    });

    it("handles Go source code and returns valid nodes", async () => {
      const code = `
package main

import "fmt"

func main() {
    fmt.Println("hello")
}
`;
      const result = await extractor.extract(code, "go", "main.go");
      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it("handles Java source code and returns valid nodes", async () => {
      const code = `
public class Main {
    public static void main(String[] args) {
        System.out.println("hello");
    }
}
`;
      const result = await extractor.extract(code, "java", "Main.java");
      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it("returns nodes and edges arrays", async () => {
      const result = await extractor.extract("def f(): pass", "python", "test.py");
      expect(Array.isArray(result.nodes)).toBe(true);
      expect(Array.isArray(result.edges)).toBe(true);
    });

    it("returns module node for empty content", async () => {
      const result = await extractor.extract("", "python", "empty.py");
      expect(result.nodes.some(n => n.type === "module")).toBe(true);
    });
  });
});