# SVG Export

SVG export renders graph with D3 force layout for interactive visualization.

## Usage

```bash
graphwiki build --export svg
# Output: graphwiki-out/graph.svg
```

Or via config:

```json
{
  "export": {
    "format": "svg",
    "layout": "force-directed",
    "nodeSize": 20,
    "linkDistance": 100
  }
}
```

## Force Layout Algorithm

D3 simulation parameters:

```typescript
interface ForceLayoutOptions {
  nodeSize: number;           // Pixel radius (default: 20)
  linkDistance: number;       // Target distance (default: 100)
  chargeStrength: number;     // Repulsion force (default: -300)
  friction: number;           // Velocity damping (default: 0.9)
  iterations: number;         // Convergence steps (default: 100)
}
```

Algorithm:
1. Initialize random node positions
2. Apply forces: links, repulsion, centering
3. Iterate until convergence or max iterations
4. Render SVG with current positions

SVG includes nodes (circles with labels) and edges (lines with arrows) in nested `<g>` groups.

## Styling

### Node Colors

By type:
- **function**: #2ca02c (green)
- **class**: #1f77b4 (blue)
- **module**: #ff7f0e (orange)
- **interface**: #d62728 (red)
- **concept**: #9467bd (purple)

### Community-Based Colors

Alternatively, color by community ID (Viridis palette).

### Edge Styling

Weighted by confidence:
- **EXTRACTED**: solid, full opacity
- **INFERRED**: dashed, 70% opacity
- **AMBIGUOUS**: dotted, 50% opacity

## Output Format

Standalone SVG file (~500KB typical for 1000-node graph):
- Embeddable in HTML
- Viewable in browser
- Exportable to PNG/PDF via tools
- Responsive to viewport size

## Interactive Features

With JavaScript:
- Hover tooltips
- Click to center node
- Drag to reposition
- Scroll to zoom (if `<script>` tag added)
