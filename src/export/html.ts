// HTML export with vis.js interactive graph for GraphWiki v2

import type { GraphDocument, GraphNode, GraphEdge } from '../types.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

/**
 * Export graph as interactive HTML using vis.js
 */
export async function exportHtml(
  graph: GraphDocument,
  outputPath: string
): Promise<void> {
  const html = generateHtml(graph);
  await mkdir(join(outputPath, '..'), { recursive: true });
  await writeFile(outputPath, html, 'utf-8');
}

/**
 * Generate HTML with embedded vis.js graph
 */
function generateHtml(graph: GraphDocument): string {
  const nodes = generateNodes(graph.nodes);
  const edges = generateEdges(graph.edges);
  const stats = generateStats(graph);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GraphWiki - Interactive Graph</title>
  <script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #eee;
    }
    #toolbar {
      padding: 12px 20px;
      background: #16213e;
      border-bottom: 1px solid #0f3460;
      display: flex;
      gap: 12px;
      align-items: center;
    }
    #toolbar h1 {
      font-size: 18px;
      font-weight: 600;
      color: #e94560;
    }
    #toolbar .stats {
      margin-left: auto;
      font-size: 13px;
      color: #888;
    }
    #graph {
      width: 100vw;
      height: calc(100vh - 50px);
    }
    #details {
      position: fixed;
      top: 70px;
      right: 20px;
      width: 320px;
      background: #16213e;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      display: none;
      max-height: calc(100vh - 100px);
      overflow-y: auto;
    }
    #details.visible { display: block; }
    #details h2 {
      font-size: 16px;
      color: #e94560;
      margin-bottom: 12px;
      border-bottom: 1px solid #0f3460;
      padding-bottom: 8px;
    }
    #details .field {
      margin-bottom: 10px;
    }
    #details .label {
      font-size: 11px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    #details .value {
      font-size: 14px;
      color: #ccc;
      margin-top: 2px;
    }
    #details pre {
      background: #0f3460;
      padding: 8px;
      border-radius: 4px;
      font-size: 12px;
      overflow-x: auto;
      white-space: pre-wrap;
    }
    .btn {
      background: #e94560;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    .btn:hover { background: #d63a52; }
    .btn.active { background: #0f3460; }
  </style>
</head>
<body>
  <div id="toolbar">
    <h1>GraphWiki</h1>
    <button class="btn" onclick="togglePhysics()">Toggle Physics</button>
    <button class="btn" onclick="fitGraph()">Fit</button>
    <div class="stats">${stats}</div>
  </div>
  <div id="graph"></div>
  <div id="details">
    <h2 id="node-title">Node Details</h2>
    <div id="node-content"></div>
  </div>

  <script>
    // Node data
    var nodes = new vis.DataSet([${nodes}]);

    // Edge data
    var edges = new vis.DataSet([${edges}]);

    // Network options
    var options = {
      nodes: {
        shape: 'dot',
        size: 16,
        font: { size: 12, color: '#eee' },
        borderWidth: 2,
        shadow: true
      },
      edges: {
        width: 1,
        color: { color: '#0f3460', highlight: '#e94560' },
        smooth: { type: 'continuous' }
      },
      physics: {
        enabled: true,
        solver: 'forceAtlas2Based',
        forceAtlas2Based: { gravitationalConstant: -50, centralGravity: 0.01 },
        stabilization: { iterations: 100 }
      },
      interaction: {
        hover: true,
        tooltipDelay: 200
      }
    };

    // Create network
    var container = document.getElementById('graph');
    var data = { nodes: nodes, edges: edges };
    var network = new vis.Network(container, data, options);

    // Node click handler
    network.on('click', function(params) {
      if (params.nodes.length > 0) {
        var nodeId = params.nodes[0];
        showNodeDetails(nodeId);
      } else {
        document.getElementById('details').classList.remove('visible');
      }
    });

    function showNodeDetails(nodeId) {
      var node = nodes.get(nodeId);
      document.getElementById('node-title').textContent = node.label || nodeId;
      document.getElementById('node-content').innerHTML = formatNodeDetails(node);
      document.getElementById('details').classList.add('visible');
    }

    function formatNodeDetails(node) {
      var html = '';
      html += '<div class=\\"field\\"><div class=\\"label\\">ID</div><div class=\\"value\\">' + node.id + '</div></div>';
      html += '<div class=\\"field\\"><div class=\\"label\\">Type</div><div class=\\"value\\">' + (node.type || 'unknown') + '</div></div>';
      if (node.community) {
        html += '<div class=\\"field\\"><div class=\\"label\\">Community</div><div class=\\"value\\">' + node.community + '</div></div>';
      }
      if (node.provenance && node.provenance.length > 0) {
        html += '<div class=\\"field\\"><div class=\\"label\\">Provenance</div><pre>' + JSON.stringify(node.provenance, null, 2) + '</pre></div>';
      }
      if (node.properties) {
        html += '<div class=\\"field\\"><div class=\\"label\\">Properties</div><pre>' + JSON.stringify(node.properties, null, 2) + '</pre></div>';
      }
      return html;
    }

    function togglePhysics() {
      var btn = event.target;
      options.physics.enabled = !options.physics.enabled;
      network.setOptions({ physics: options.physics });
      btn.classList.toggle('active');
    }

    function fitGraph() {
      network.fit({ animation: true });
    }

    // Color nodes by type
    var typeColors = {
      'function': '#e94560',
      'class': '#0f3460',
      'module': '#533483',
      'interface': '#0ead69',
      'concept': '#ffcc00',
      'entity': '#00bcd4'
    };

    nodes.forEach(function(node) {
      var color = typeColors[node.type] || '#666';
      nodes.update({ id: node.id, color: { background: color, border: color } });
    });
  </script>
</body>
</html>`;
}

/**
 * Generate vis.js nodes from graph nodes
 */
function generateNodes(graphNodes: GraphNode[]): string {
  return graphNodes
    .map(node => {
      const label = escapeString(node.label || node.id);
      const type = escapeString(node.type || 'unknown');
      return `{
        id: "${escapeString(node.id)}",
        label: "${label}",
        type: "${type}",
        title: "${type}: ${label}",
        community: ${node.community ?? -1},
        provenance: ${JSON.stringify(node.provenance ?? [])}
      }`;
    })
    .join(',\n');
}

/**
 * Generate vis.js edges from graph edges
 */
function generateEdges(graphEdges: GraphEdge[]): string {
  return graphEdges
    .map(edge => {
      const label = edge.label ? `"${escapeString(edge.label)}"` : 'null';
      return `{
        from: "${escapeString(edge.source)}",
        to: "${escapeString(edge.target)}",
        label: ${label},
        value: ${edge.weight}
      }`;
    })
    .join(',\n');
}

/**
 * Generate statistics string
 */
function generateStats(graph: GraphDocument): string {
  const nodeCount = graph.nodes.length;
  const edgeCount = graph.edges.length;
  const communityCount = new Set(graph.nodes.map(n => n.community)).size;

  return `${nodeCount} nodes, ${edgeCount} edges, ${communityCount} communities`;
}

/**
 * Escape string for JavaScript embedding
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/'/g, "\\'");
}

/**
 * Export graph as standalone HTML file
 */
export async function exportGraphHtml(graph: GraphDocument, outputDir = 'graphwiki-out/exports'): Promise<string> {
  const outputPath = join(outputDir, 'graph.html');
  await exportHtml(graph, outputPath);
  return outputPath;
}
