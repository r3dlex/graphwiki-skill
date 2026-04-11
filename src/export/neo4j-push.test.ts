import { describe, it, expect, vi, beforeEach } from "vitest";
import { pushGraphToNeo4j } from "./neo4j-push.js";
import type { GraphDocument } from "../types.js";

// Stable mocks — not reset between tests, only cleared
const mockRun = vi.fn().mockResolvedValue({ records: [] });
const mockSessionClose = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockVerifyConnectivity = vi.fn().mockResolvedValue(undefined);
const mockSessionFactory = vi.fn().mockReturnValue({ run: mockRun, close: mockSessionClose });
const mockDriverFactory = vi.fn().mockReturnValue({
  verifyConnectivity: mockVerifyConnectivity,
  session: mockSessionFactory,
  close: mockClose,
});

vi.mock("neo4j-driver", () => ({
  default: {
    driver: mockDriverFactory,
    auth: {
      basic: vi.fn().mockReturnValue({ scheme: "basic", principal: "neo4j", credentials: "pass" }),
    },
  },
}));

const sampleGraph: GraphDocument = {
  nodes: [
    { id: "n1", label: "Alpha", type: "function", community: 1 },
    { id: "n2", label: "Beta", type: "class", community: 2 },
  ],
  edges: [
    { id: "e1", source: "n1", target: "n2", weight: 1.0, label: "calls" },
  ],
};

describe("pushGraphToNeo4j", () => {
  beforeEach(() => {
    mockRun.mockClear().mockResolvedValue({ records: [] });
    mockSessionClose.mockClear().mockResolvedValue(undefined);
    mockClose.mockClear().mockResolvedValue(undefined);
    mockVerifyConnectivity.mockClear().mockResolvedValue(undefined);
    mockSessionFactory.mockClear().mockReturnValue({ run: mockRun, close: mockSessionClose });
    mockDriverFactory.mockClear().mockReturnValue({
      verifyConnectivity: mockVerifyConnectivity,
      session: mockSessionFactory,
      close: mockClose,
    });
  });

  // Unit test: mock driver — verifies session.run called for nodes and edges
  it("unit: calls session.run for each node and edge", async () => {
    const result = await pushGraphToNeo4j(sampleGraph, {
      uri: "neo4j://localhost:7687",
      user: "neo4j",
      password: "secret",
      database: "neo4j",
    });

    // 2 nodes + 1 edge + 3 index queries = 6 run() calls
    expect(mockRun).toHaveBeenCalledTimes(6);
    expect(result.nodeCount).toBe(2);
    expect(result.edgeCount).toBe(1);
  });

  // Delegation test: verifies pushGraphToNeo4j is a callable function
  it("delegation: pushGraphToNeo4j is a callable function exported from neo4j-push module", () => {
    expect(typeof pushGraphToNeo4j).toBe("function");
  });

  // Unit test: throws when connectivity check fails
  it("unit: throws when Neo4j connection fails", async () => {
    mockVerifyConnectivity.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(
      pushGraphToNeo4j(sampleGraph, {
        uri: "neo4j://bad-host:7687",
        user: "neo4j",
        password: "wrong",
      })
    ).rejects.toThrow("Connection failed");
  });

  // Unit test: driver.close() and session.close() are always called after a successful push
  it("unit: driver.close() and session.close() are called after successful push", async () => {
    await pushGraphToNeo4j(sampleGraph, {
      uri: "neo4j://localhost:7687",
      user: "neo4j",
      password: "secret",
    });

    expect(mockSessionClose).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });
});
