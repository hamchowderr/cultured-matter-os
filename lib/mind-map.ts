import { z } from "zod/v4";

// Saved mind maps (the mind_maps table) and the records a map node can point at. Shared by the
// actions (validation), the editor and the business map, so it holds no database code.

export const RECORD_TYPES = ["project", "task", "contact", "company", "grant", "idea"] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const RECORD_LABELS: Record<RecordType, string> = {
  project: "Project",
  task: "Task",
  contact: "Person",
  company: "Radar company",
  grant: "Grant",
  idea: "Idea"
};

// Size caps. A map is drawn on a phone and read whole by the assistant, so it stays small.
export const MAX_TITLE = 120;
export const MAX_LABEL = 200;
export const MAX_NODES = 300;
export const MAX_EDGES = 600;
// Positions are canvas pixels; this keeps a bad value from throwing the view miles away.
const MAX_COORD = 100_000;

const nodeId = z.string().trim().min(1).max(64);
const coord = z.number().finite().min(-MAX_COORD).max(MAX_COORD);

export const recordLinkSchema = z.object({
  type: z.enum(RECORD_TYPES),
  id: z.string().trim().min(1).max(64)
});

export const mindMapNodeSchema = z.object({
  id: nodeId,
  label: z.string().trim().min(1, "Every node needs a label").max(MAX_LABEL),
  x: coord,
  y: coord,
  link: recordLinkSchema.nullable().optional()
});

export const mindMapEdgeSchema = z.object({
  id: nodeId,
  source: nodeId,
  target: nodeId
});

export type RecordLink = z.infer<typeof recordLinkSchema>;
export type MindMapNode = z.infer<typeof mindMapNodeSchema>;
export type MindMapEdge = z.infer<typeof mindMapEdgeSchema>;

export const mindMapTitle = z.string().trim().min(1, "Give the map a title").max(MAX_TITLE);

export const mindMapNodes = z
  .array(mindMapNodeSchema)
  .max(MAX_NODES, `A map can hold up to ${MAX_NODES} nodes`);
export const mindMapEdges = z
  .array(mindMapEdgeSchema)
  .max(MAX_EDGES, `A map can hold up to ${MAX_EDGES} links`);

// Nodes and edges together: ids unique, every edge joins two nodes of this map, no node joined
// to itself and no pair joined twice (either direction). Used as a superRefine so the action
// inputs reject a broken graph before anything runs.
export function checkGraph(
  { nodes, edges }: { nodes?: MindMapNode[]; edges?: MindMapEdge[] },
  ctx: z.RefinementCtx
) {
  if (!nodes || !edges) return;
  const ids = new Set<string>();
  for (const n of nodes) {
    if (ids.has(n.id)) {
      ctx.addIssue({ code: "custom", message: `Two nodes share the id ${n.id}` });
      return;
    }
    ids.add(n.id);
  }
  const edgeIds = new Set<string>();
  const pairs = new Set<string>();
  for (const e of edges) {
    if (edgeIds.has(e.id)) {
      ctx.addIssue({ code: "custom", message: `Two links share the id ${e.id}` });
      return;
    }
    edgeIds.add(e.id);
    if (!ids.has(e.source) || !ids.has(e.target)) {
      ctx.addIssue({
        code: "custom",
        message: `Link ${e.id} points at a node that isn't on the map`
      });
      return;
    }
    if (e.source === e.target) {
      ctx.addIssue({ code: "custom", message: "A node can't be linked to itself" });
      return;
    }
    const pair = [e.source, e.target].sort().join("\u0000");
    if (pairs.has(pair)) {
      ctx.addIssue({ code: "custom", message: "Two nodes are linked twice" });
      return;
    }
    pairs.add(pair);
  }
}

export const mindMapGraphSchema = z
  .object({ nodes: mindMapNodes, edges: mindMapEdges })
  .superRefine(checkGraph);

export type MindMapGraph = z.infer<typeof mindMapGraphSchema>;

// A new map starts with one node: its title, in the middle.
export function starterGraph(title: string): MindMapGraph {
  return { nodes: [{ id: "root", label: title, x: 0, y: 0, link: null }], edges: [] };
}

// Where a record lives in the app. Pages that have no per-record URL get a search that finds it.
export function recordHref(
  link: RecordLink,
  context: { title?: string; projectId?: string | null; filed?: boolean } = {}
): string {
  const q = (v: string | undefined) => (v ? `&q=${encodeURIComponent(v)}` : "");
  switch (link.type) {
    case "project":
      return `/projects?p=${encodeURIComponent(link.id)}`;
    case "task":
      return context.projectId
        ? `/projects?p=${encodeURIComponent(context.projectId)}&task=${encodeURIComponent(link.id)}`
        : `/projects?task=${encodeURIComponent(link.id)}`;
    case "contact":
      return context.title ? `/people?q=${encodeURIComponent(context.title)}` : "/people";
    case "company":
      // Radar opens the company's panel from ?company=.
      return `/radar?view=all${q(context.title)}&company=${encodeURIComponent(link.id)}`;
    case "grant":
      return `/grants?all=1&closed=1${q(context.title)}`;
    case "idea":
      return context.filed ? "/inbox?view=filed" : "/inbox";
  }
}

export const recordKey = (link: RecordLink) => `${link.type}:${link.id}`;
