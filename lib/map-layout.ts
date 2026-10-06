import dagre from "@dagrejs/dagre";

// Automatic placement for the maps, with dagre (React Flow's recommended tree layout). Positions
// are React Flow's: the node's top-left corner.

export type LayoutNode = { id: string; width: number; height: number };
export type LayoutEdge = { source: string; target: string };
export type Point = { x: number; y: number };

type Direction = "LR" | "RL" | "TB";

const SPACING = { nodesep: 18, ranksep: 70 };

// One dagre pass. Returns centre points.
function centres(nodes: LayoutNode[], edges: LayoutEdge[], rankdir: Direction) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir, ...SPACING });
  g.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) g.setNode(n.id, { width: n.width, height: n.height });
  for (const e of edges) {
    if (ids.has(e.source) && ids.has(e.target) && e.source !== e.target)
      g.setEdge(e.source, e.target);
  }
  dagre.layout(g);
  const out = new Map<string, Point>();
  for (const n of nodes) {
    const p = g.node(n.id) as { x: number; y: number };
    out.set(n.id, { x: p.x, y: p.y });
  }
  return out;
}

const topLeft = (c: Point, n: LayoutNode): Point => ({
  x: Math.round(c.x - n.width / 2),
  y: Math.round(c.y - n.height / 2)
});

// A plain left-to-right layout of any graph (cycles are fine: dagre breaks them). The saved-map
// editor's Tidy button.
export function layoutGraph(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  direction: Direction = "LR"
): Map<string, Point> {
  if (nodes.length === 0) return new Map();
  const c = centres(nodes, edges, direction);
  return new Map(nodes.map((n) => [n.id, topLeft(c.get(n.id)!, n)]));
}

// The mind-map shape: the root in the middle, one tree growing right and one growing left.
// Each side is a separate dagre pass, then both are moved so the root sits at (0, 0). Nodes on
// neither side, or not reachable through the given edges, are laid out with the right side.
export function layoutTwoSided(
  rootId: string,
  nodes: (LayoutNode & { side?: "left" | "right" })[],
  edges: LayoutEdge[]
): Map<string, Point> {
  const root = nodes.find((n) => n.id === rootId);
  if (!root) return layoutGraph(nodes, edges);

  const out = new Map<string, Point>();
  for (const side of ["right", "left"] as const) {
    const members = nodes.filter(
      (n) => n.id === rootId || (side === "left" ? n.side === "left" : n.side !== "left")
    );
    if (members.length === 1 && side === "left") continue;
    const ids = new Set(members.map((n) => n.id));
    const sideEdges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    const c = centres(members, sideEdges, side === "right" ? "LR" : "RL");
    const r = c.get(rootId)!;
    for (const n of members) {
      if (n.id === rootId) continue;
      const p = c.get(n.id)!;
      out.set(n.id, topLeft({ x: p.x - r.x, y: p.y - r.y }, n));
    }
  }
  out.set(rootId, topLeft({ x: 0, y: 0 }, root));
  return out;
}
