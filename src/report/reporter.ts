import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { GraphDocument, GraphNode, GraphEdge } from '../types.js';
import type { ReporterConfig, Surprise } from './types.js';

const DEFAULT_CONFIG: Required<ReporterConfig> = {
  top_n_god_nodes: 10,
  output_dir: 'graphwiki-out',
};

export class GraphReporter {
  private graph: GraphDocument;
  private config: Required<ReporterConfig>;

  constructor(graph: GraphDocument, config: ReporterConfig = {}) {
    this.graph = graph;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async generateReport(): Promise<string> {
    const godNodes = this.detectGodNodes(this.graph, this.config.top_n_god_nodes);
    const surprises = this.detectSurprises(this.graph);

    const lines: string[] = [
      '# GraphWiki Analysis Report',
      '',
      `Generated: ${new Date().toISOString()}`,
      '',
      '---',
      '',
      '## Graph Summary',
      '',
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Total Nodes | ${this.graph.nodes.length} |`,
      `| Total Edges | ${this.graph.edges.length} |`,
      `| Average Degree | ${this.averageDegree().toFixed(2)} |`,
      `| Graph Completeness | ${((this.graph.metadata?.completeness ?? 0) * 100).toFixed(0)}% |`,
      '',
      '---',
      '',
      '## God Nodes',
      '',
      'Top nodes by weighted degree (most connected/influential):',
      '',
    ];

    if (godNodes.length > 0) {
      lines.push(
        '| Node | Type | Weighted Degree | Community |',
        '|------|------|-----------------|-----------|',
      );
      for (const node of godNodes) {
        const degree = this.getWeightedDegree(node.id);
        lines.push(
          `| **${node.label}** | ${node.type} | ${degree.toFixed(2)} | ${node.community ?? 'N/A'} |`,
        );
      }
    } else {
      lines.push('No god nodes detected.');
    }

    lines.push('', '---', '', '## Surprise Analysis', '');

    if (surprises.length > 0) {
      for (const surprise of surprises) {
        lines.push(
          `### ${surprise.type.replace(/_/g, ' ')} (${surprise.severity})`,
          '',
          surprise.description,
          '',
          `Affected nodes: ${surprise.affected_nodes.join(', ')}`,
          '',
        );
      }
    } else {
      lines.push('No surprises detected — graph appears consistent.');
    }

    if (this.isPartial()) {
      lines.push('---', '', '## Missing Sources', '');
      lines.push(
        'The following nodes lack provenance information. ' +
          'This indicates the graph is partially complete.',
        '',
      );
      const missingNodes = this.graph.nodes.filter(
        (n) => !n.provenance || n.provenance.length === 0,
      );
      for (const node of missingNodes.slice(0, 20)) {
        lines.push(`- **${node.label}** (${node.type}) — community: ${node.community ?? 'N/A'}`);
      }
      if (missingNodes.length > 20) {
        lines.push(`- ... and ${missingNodes.length - 20} more`);
      }
    }

    const reportContent = lines.join('\n');

    const outputDir = this.config.output_dir;
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
    const reportPath = join(outputDir, 'GRAPH_REPORT.md');
    writeFileSync(reportPath, reportContent, 'utf-8');

    return reportContent;
  }

  detectGodNodes(graph: GraphDocument, topN?: number): GraphNode[] {
    const degreeMap = new Map<string, number>();

    for (const edge of graph.edges) {
      const sourceDegree = degreeMap.get(edge.source) ?? 0;
      const targetDegree = degreeMap.get(edge.target) ?? 0;
      degreeMap.set(edge.source, sourceDegree + edge.weight);
      degreeMap.set(edge.target, targetDegree + edge.weight);
    }

    const scored = graph.nodes
      .map((node) => ({
        node,
        score: degreeMap.get(node.id) ?? 0,
      }))
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, topN ?? this.config.top_n_god_nodes).map((s) => s.node);
  }

  detectSurprises(graph: GraphDocument): Surprise[] {
    const surprises: Surprise[] = [];

    // Unexpected connections: nodes with very high degree in an otherwise low-degree graph
    const degrees = new Map<string, number>();
    for (const edge of graph.edges) {
      degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
      degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
    }
    const avgDegree =
      graph.edges.length / Math.max(graph.nodes.length, 1);
    const degreeThreshold = avgDegree * 3;

    for (const [nodeId, degree] of degrees) {
      if (degree > degreeThreshold && degree > 5) {
        const node = graph.nodes.find((n) => n.id === nodeId);
        if (node) {
          surprises.push({
            type: 'unexpected_connection',
            description: `Node "${node.label}" has ${degree} connections, which is significantly above the average of ${avgDegree.toFixed(1)}.`,
            affected_nodes: [nodeId],
            severity: degree > degreeThreshold * 2 ? 'high' : 'medium',
          });
        }
      }
    }

    // Isolated clusters: communities with very few internal connections
    const communityDegrees = new Map<number, { internal: number; external: number; nodes: string[] }>();
    for (const node of graph.nodes) {
      const cid = node.community ?? -1;
      if (!communityDegrees.has(cid)) {
        communityDegrees.set(cid, { internal: 0, external: 0, nodes: [] });
      }
      communityDegrees.get(cid)!.nodes.push(node.id);
    }

    for (const edge of graph.edges) {
      const srcComm = graph.nodes.find((n) => n.id === edge.source)?.community ?? -1;
      const tgtComm = graph.nodes.find((n) => n.id === edge.target)?.community ?? -1;
      if (srcComm === tgtComm) {
        communityDegrees.get(srcComm)!.internal++;
      } else {
        communityDegrees.get(srcComm)!.external++;
        communityDegrees.get(tgtComm)!.external++;
      }
    }

    for (const [cid, data] of communityDegrees) {
      if (data.internal === 0 && data.nodes.length > 1) {
        surprises.push({
          type: 'isolated_cluster',
          description: `Community ${cid} has ${data.nodes.length} nodes but zero internal edges. This cluster may be disconnected.`,
          affected_nodes: data.nodes,
          severity: 'low',
        });
      }
    }

    // God node anomalies
    const godNodes = this.detectGodNodes(graph, 5);
    if (godNodes.length > 0) {
      const topNode = godNodes[0];
      const topDegree = degrees.get(topNode.id) ?? 0;
      const secondDegree = degrees.get(godNodes[1]?.id ?? '') ?? 0;
      if (topDegree > secondDegree * 5 && topDegree > 10) {
        surprises.push({
          type: 'god_node_anomaly',
          description: `Node "${topNode.label}" is a dominant hub with ${topDegree} connections, far exceeding other nodes. This may indicate a star-topology or point of failure.`,
          affected_nodes: [topNode.id],
          severity: 'medium',
        });
      }
    }

    return surprises;
  }

  private averageDegree(): number {
    if (this.graph.nodes.length === 0) return 0;
    return (this.graph.edges.length * 2) / this.graph.nodes.length;
  }

  private getWeightedDegree(nodeId: string): number {
    return this.graph.edges.reduce((sum, edge) => {
      if (edge.source === nodeId || edge.target === nodeId) {
        return sum + edge.weight;
      }
      return sum;
    }, 0);
  }

  private isPartial(): boolean {
    return (
      this.graph.metadata?.completeness === undefined ||
      (this.graph.metadata?.completeness ?? 0) < 1.0
    );
  }
}
