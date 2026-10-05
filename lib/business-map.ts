import { z } from "zod/v4";

import { recordHref, recordLinkSchema, type RecordLink } from "./mind-map";

// The live business map: Cultured Matter in the middle, its projects and their open tasks on
// the right, and on the left the ideas, the Radar companies she is keeping an eye on (with the
// people who can reach them) and the grants on her board. getBusinessMap (actions/maps.ts) reads
// the rows; buildBusinessMap turns them into nodes and edges. Nothing here is stored.

export const NODE_KINDS = [
  "business",
  "hub",
  "project",
  "task",
  "idea",
  "company",
  "person",
  "grant",
  "more"
] as const;
export type BusinessNodeKind = (typeof NODE_KINDS)[number];

// How much of each list the map shows; the rest folds into a "+N more" node that opens the page.
export const CAPS = {
  tasksPerProject: 8,
  ideas: 20,
  companies: 20,
  peoplePerCompany: 4,
  grants: 20,
  looseTasks: 8
} as const;

export const businessMapNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(NODE_KINDS),
  label: z.string(),
  side: z.enum(["left", "right"]),
  // The real record behind the node, if any, and where it lives in the app.
  record: recordLinkSchema.nullable(),
  href: z.string().nullable(),
  status: z.string().nullable(),
  // A second line: a project's description, a company's stage, a person's role, an agency.
  detail: z.string().nullable(),
  // A task's due date or a grant's deadline.
  due: z.date().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).nullable()
});

export const businessMapEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  // "tree" edges make the layout; "cross" edges are extra links (a task also in another
  // project), drawn dashed.
  kind: z.enum(["tree", "cross"])
});

export const businessMapSchema = z.object({
  rootId: z.string(),
  nodes: z.array(businessMapNodeSchema),
  edges: z.array(businessMapEdgeSchema),
  // Everything that exists, before the caps above.
  counts: z.object({
    projects: z.number(),
    tasks: z.number(),
    ideas: z.number(),
    companies: z.number(),
    people: z.number(),
    grants: z.number()
  })
});

export type BusinessMapNode = z.infer<typeof businessMapNodeSchema>;
export type BusinessMapEdge = z.infer<typeof businessMapEdgeSchema>;
export type BusinessMap = z.infer<typeof businessMapSchema>;

type Priority = NonNullable<BusinessMapNode["priority"]>;

export type BusinessMapData = {
  businessName: string;
  projects: { id: string; name: string; status: string; description: string | null }[];
  // Open top-level tasks. alsoIn: other projects the task is linked into.
  tasks: {
    id: string;
    title: string;
    status: string;
    priority: Priority;
    dueDate: Date | null;
    projectId: string | null;
    alsoIn: string[];
  }[];
  ideas: { id: string; body: string; projectId: string | null; filedAt: Date | null }[];
  companies: { id: string; name: string; status: string; stage: string | null }[];
  // Warm paths: a contact who can reach a company (same rules as findWarmPath).
  people: {
    companyId: string;
    contactId: string;
    fullName: string;
    position: string | null;
    company: string | null;
  }[];
  grants: {
    id: string;
    title: string;
    status: string;
    agency: string | null;
    deadline: Date | null;
  }[];
};

export const ROOT_ID = "business";

export type MoreOf = "tasks" | "ideas" | "companies" | "people" | "grants";

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const STATUS_RANK: Record<string, number> = { in_progress: 0, waiting: 1, replied: 1, todo: 2 };

// Most pressing first: in progress, then priority, then soonest due.
function byPressing(a: BusinessMapData["tasks"][number], b: BusinessMapData["tasks"][number]) {
  return (
    (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3) ||
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity)
  );
}

export function shorten(text: string, max = 70) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

export function buildBusinessMap(data: BusinessMapData): BusinessMap {
  const nodes: BusinessMapNode[] = [];
  const edges: BusinessMapEdge[] = [];
  const has = new Set<string>();

  const node = (
    n: Omit<BusinessMapNode, "record" | "href" | "status" | "detail" | "due" | "priority"> &
      Partial<BusinessMapNode>
  ) => {
    if (has.has(n.id)) return false;
    has.add(n.id);
    nodes.push({
      record: null,
      href: null,
      status: null,
      detail: null,
      due: null,
      priority: null,
      ...n
    });
    return true;
  };
  const edge = (source: string, target: string, kind: "tree" | "cross" = "tree") =>
    edges.push({ id: `${kind}:${source}->${target}`, source, target, kind });
  const recordNode = (
    link: RecordLink,
    rest: Omit<
      BusinessMapNode,
      "id" | "record" | "href" | "status" | "detail" | "due" | "priority"
    > &
      Partial<BusinessMapNode>,
    hrefContext: Parameters<typeof recordHref>[1] = {}
  ) => {
    const id = `${link.type}:${link.id}`;
    node({
      id,
      record: link,
      href: recordHref(link, { title: rest.label, ...hrefContext }),
      ...rest
    });
    return id;
  };
  // detail names what overflowed (the map screen hides it with that layer).
  const more = (
    parent: string,
    what: MoreOf,
    count: number,
    side: "left" | "right",
    href: string
  ) => {
    if (count <= 0) return;
    const id = `more:${parent}`;
    node({ id, kind: "more", label: `+${count} more`, side, href, detail: what });
    edge(parent, id);
  };
  const hub = (id: string, label: string, side: "left" | "right", href: string) => {
    node({ id: `hub:${id}`, kind: "hub", label, side, href });
    edge(ROOT_ID, `hub:${id}`);
    return `hub:${id}`;
  };

  node({
    id: ROOT_ID,
    kind: "business",
    label: data.businessName,
    side: "right",
    href: "/settings/business"
  });

  // Right: projects, then their most pressing open tasks.
  const projectIds = new Set(data.projects.map((p) => p.id));
  for (const p of data.projects) {
    const id = recordNode(
      { type: "project", id: p.id },
      {
        kind: "project",
        label: p.name,
        side: "right",
        status: p.status,
        detail: p.description ? shorten(p.description, 90) : null
      }
    );
    edge(ROOT_ID, id);
  }

  const tasksByHome = new Map<string, BusinessMapData["tasks"]>();
  for (const t of [...data.tasks].sort(byPressing)) {
    const home = t.projectId && projectIds.has(t.projectId) ? t.projectId : null;
    const key = home ?? "";
    tasksByHome.set(key, [...(tasksByHome.get(key) ?? []), t]);
  }
  const taskNode = (t: BusinessMapData["tasks"][number], parent: string) => {
    const id = recordNode(
      { type: "task", id: t.id },
      {
        kind: "task",
        label: t.title,
        side: "right",
        status: t.status,
        due: t.dueDate,
        priority: t.priority
      },
      { projectId: t.projectId }
    );
    edge(parent, id);
    for (const other of t.alsoIn) {
      if (other !== t.projectId && projectIds.has(other)) edge(`project:${other}`, id, "cross");
    }
  };
  for (const p of data.projects) {
    const list = tasksByHome.get(p.id) ?? [];
    for (const t of list.slice(0, CAPS.tasksPerProject)) taskNode(t, `project:${p.id}`);
    more(
      `project:${p.id}`,
      "tasks",
      list.length - CAPS.tasksPerProject,
      "right",
      recordHref({ type: "project", id: p.id })
    );
  }
  const loose = tasksByHome.get("") ?? [];
  if (loose.length) {
    const h = hub("loose", "Tasks without a project", "right", "/projects?view=tasks");
    for (const t of loose.slice(0, CAPS.looseTasks)) taskNode(t, h);
    more(h, "tasks", loose.length - CAPS.looseTasks, "right", "/projects?view=tasks");
  }

  // Left: ideas (under their project when they have one on the map), Radar, grants.
  const ideaNode = (
    i: BusinessMapData["ideas"][number],
    parent: string,
    side: "left" | "right"
  ) => {
    const id = recordNode(
      { type: "idea", id: i.id },
      { kind: "idea", label: shorten(i.body), side },
      { filed: !!i.filedAt }
    );
    edge(parent, id);
  };
  const ideas = data.ideas.slice(0, CAPS.ideas);
  const loneIdeas = ideas.filter((i) => !i.projectId || !projectIds.has(i.projectId));
  for (const i of ideas) {
    if (i.projectId && projectIds.has(i.projectId)) ideaNode(i, `project:${i.projectId}`, "right");
  }
  if (loneIdeas.length || data.ideas.length > CAPS.ideas) {
    const h = hub("ideas", "Ideas", "left", "/inbox?view=filed");
    for (const i of loneIdeas) ideaNode(i, h, "left");
    more(h, "ideas", data.ideas.length - CAPS.ideas, "left", "/inbox?view=filed");
  }

  if (data.companies.length) {
    const h = hub("radar", "Radar", "left", "/radar?view=shortlisted");
    const peopleBy = new Map<string, BusinessMapData["people"]>();
    for (const p of data.people)
      peopleBy.set(p.companyId, [...(peopleBy.get(p.companyId) ?? []), p]);
    for (const c of data.companies.slice(0, CAPS.companies)) {
      const cid = recordNode(
        { type: "company", id: c.id },
        { kind: "company", label: c.name, side: "left", status: c.status, detail: c.stage }
      );
      edge(h, cid);
      // One node per person per company; the same person under two companies appears twice.
      const seen = new Set<string>();
      const people = (peopleBy.get(c.id) ?? []).filter((p) =>
        seen.has(p.contactId) ? false : (seen.add(p.contactId), true)
      );
      for (const p of people.slice(0, CAPS.peoplePerCompany)) {
        const id = `contact:${p.contactId}@${c.id}`;
        node({
          id,
          kind: "person",
          label: p.fullName,
          side: "left",
          record: { type: "contact", id: p.contactId },
          href: recordHref({ type: "contact", id: p.contactId }, { title: p.fullName }),
          detail: [p.position, p.company].filter(Boolean).join(" · ") || null
        });
        edge(cid, id);
      }
      more(
        cid,
        "people",
        people.length - CAPS.peoplePerCompany,
        "left",
        recordHref({ type: "company", id: c.id }, { title: c.name })
      );
    }
    more(h, "companies", data.companies.length - CAPS.companies, "left", "/radar?view=shortlisted");
  }

  if (data.grants.length) {
    const h = hub("grants", "Grants", "left", "/grants");
    for (const g of data.grants.slice(0, CAPS.grants)) {
      const id = recordNode(
        { type: "grant", id: g.id },
        {
          kind: "grant",
          label: g.title,
          side: "left",
          status: g.status,
          detail: g.agency,
          due: g.deadline
        }
      );
      edge(h, id);
    }
    more(h, "grants", data.grants.length - CAPS.grants, "left", "/grants");
  }

  return {
    rootId: ROOT_ID,
    nodes,
    edges,
    counts: {
      projects: data.projects.length,
      tasks: data.tasks.length,
      ideas: data.ideas.length,
      companies: data.companies.length,
      people: new Set(data.people.map((p) => p.contactId)).size,
      grants: data.grants.length
    }
  };
}

// ---------------------------------------------------------------- Layers on the map screen

// Layers she can switch off to thin the map out (on a phone especially).
export const LAYERS = [
  { value: "tasks", label: "Tasks", kinds: ["task"] },
  { value: "ideas", label: "Ideas", kinds: ["idea"] },
  { value: "companies", label: "Radar", kinds: ["company"] },
  { value: "people", label: "People", kinds: ["person"] },
  { value: "grants", label: "Grants", kinds: ["grant"] }
] as const satisfies readonly { value: string; label: string; kinds: BusinessNodeKind[] }[];
export type Layer = (typeof LAYERS)[number]["value"];
export const ALL_LAYERS = LAYERS.map((l) => l.value) as Layer[];
// Groups that only hold one layer disappear with it.
const HUB_LAYER: Record<string, Layer> = {
  "hub:loose": "tasks",
  "hub:ideas": "ideas",
  "hub:radar": "companies",
  "hub:grants": "grants"
};

// The nodes still shown with some layers off: a node goes when its layer is off or its parent
// went; a "+N more" goes with the layer it counts.
export function visibleNodes(map: BusinessMap, layers: Layer[]) {
  const on = new Set(layers);
  const hiddenKinds = new Set<BusinessNodeKind>(
    LAYERS.filter((l) => !on.has(l.value)).flatMap((l) => l.kinds)
  );
  const parent = new Map<string, string>();
  for (const e of map.edges) if (e.kind === "tree") parent.set(e.target, e.source);
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const keep = new Map<string, boolean>();
  const kept = (n: BusinessMapNode): boolean => {
    const cached = keep.get(n.id);
    if (cached !== undefined) return cached;
    let ok = !hiddenKinds.has(n.kind);
    if (ok && n.kind === "more") ok = on.has(n.detail as Layer);
    if (ok && HUB_LAYER[n.id]) ok = on.has(HUB_LAYER[n.id]);
    const p = parent.get(n.id);
    if (ok && p) ok = kept(byId.get(p)!);
    keep.set(n.id, ok);
    return ok;
  };
  return map.nodes.filter(kept);
}

// The records on the map, once each: what a saved-map node can be linked to.
export function mapRecords(map: BusinessMap) {
  const seen = new Set<string>();
  const out: { type: RecordLink["type"]; id: string; title: string; href: string | null }[] = [];
  for (const n of map.nodes) {
    if (!n.record) continue;
    const key = `${n.record.type}:${n.record.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...n.record, title: n.label, href: n.href });
  }
  return out;
}
