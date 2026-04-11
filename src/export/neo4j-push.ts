/**
 * pushGraphToNeo4j — extracted from cli.ts push command.
 * Pushes all nodes and relationships of a GraphDocument into a Neo4j instance.
 */

import type { GraphDocument } from "../types.js";

export interface Neo4jPushOptions {
  uri: string;
  user: string;
  password: string;
  database?: string;
}

export interface Neo4jPushResult {
  nodeCount: number;
  edgeCount: number;
}

export async function pushGraphToNeo4j(
  graph: GraphDocument,
  options: Neo4jPushOptions
): Promise<Neo4jPushResult> {
  const { uri, user, password, database = "neo4j" } = options;

  const neo4j = await import("neo4j-driver");
  const driver = neo4j.default.driver(uri, neo4j.default.auth.basic(user, password));

  try {
    await driver.verifyConnectivity();
  } catch (err) {
    await driver.close();
    throw new Error(`[neo4j-push] Connection failed: ${String(err)}`);
  }

  const session = driver.session({ database });
  try {
    // Import nodes
    for (const node of graph.nodes) {
      const props: Record<string, unknown> = {
        id: node.id,
        label: node.label || node.id,
      };
      if (node.type) props["type"] = node.type;
      if (node.community !== undefined) props["community"] = node.community;
      if ((node as unknown as Record<string, unknown>)["source_file"]) {
        props["source_file"] = (node as unknown as Record<string, unknown>)["source_file"];
      }
      if (node.provenance) props["provenance"] = JSON.stringify(node.provenance);
      if (node.properties) Object.assign(props, node.properties);

      const labels = node.type ? [`GraphNode`, node.type] : ["GraphNode"];
      const labelStr = labels.map((l) => `:${l}`).join("");

      const propKeys = Object.keys(props);
      const propValues = propKeys.map((k) => `node.${k} = $${k}`).join(", ");
      const params: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(props)) {
        params[k] = v;
      }

      await session.run(
        `MERGE (n ${labelStr} {id: $id}) SET ${propValues}`,
        params
      );
    }

    // Import relationships
    for (const edge of graph.edges) {
      const relType = (edge.label || "RELATES_TO").toUpperCase().replace(/\s+/g, "_");
      await session.run(
        `MATCH (a {id: $source}), (b {id: $target}) MERGE (a)-[r:${relType}]->(b) SET r.id = $id, r.weight = $weight`,
        { source: edge.source, target: edge.target, id: edge.id, weight: edge.weight }
      );
    }

    // Create indexes
    await session.run("CREATE INDEX node_id_index IF NOT EXISTS FOR (n:GraphNode) ON (n.id)");
    await session.run("CREATE INDEX node_type_index IF NOT EXISTS FOR (n:GraphNode) ON (n.type)");
    await session.run("CREATE INDEX node_community_index IF NOT EXISTS FOR (n:GraphNode) ON (n.community)");

    return { nodeCount: graph.nodes.length, edgeCount: graph.edges.length };
  } finally {
    await session.close();
    await driver.close();
  }
}
