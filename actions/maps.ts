import { and, asc, desc, eq, inArray, isNull, ne, not, or, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

import type { Executor } from "@/db";
import {
  businessProfile,
  captures,
  companies,
  contacts,
  grants,
  mindMaps,
  projects,
  taskProjects,
  tasks
} from "@/db/schema";
import { buildBusinessMap, businessMapSchema, type BusinessMapData } from "@/lib/business-map";
import {
  checkGraph,
  mindMapEdges,
  mindMapNodes,
  mindMapTitle,
  RECORD_LABELS,
  RECORD_TYPES,
  recordHref,
  recordKey,
  type MindMapNode,
  type RecordLink,
  type RecordType,
  starterGraph
} from "@/lib/mind-map";
import { personalSql } from "@/lib/personal-sql";
import { ActionError, defineAction } from "./define";
import { warmPathsFor } from "./people";
import { id, limit } from "./schemas";

// ---------------------------------------------------------------- The live business map

export const getBusinessMap = defineAction({
  name: "getBusinessMap",
  description:
    "The live map of the business, built from the app's data: Cultured Matter at the centre; its open projects and their most pressing open tasks; ideas from the Inbox; starred and shortlisted Radar companies with the people who can reach them; and the grants on the board. Each node names its kind, its record (type and id) and where it opens in the app. counts gives the full totals, since long lists are cut short on the map.",
  kind: "read",
  input: z.object({}),
  output: businessMapSchema,
  async handler(_input, db) {
    return buildBusinessMap(await loadBusinessMapData(db));
  }
});

async function loadBusinessMapData(db: Executor): Promise<BusinessMapData> {
  const [profile] = await db
    .select({ name: businessProfile.name })
    .from(businessProfile)
    .where(eq(businessProfile.id, "main"));

  // Business projects that are still going; Personal ones belong on Today, not on this map.
  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      description: projects.description
    })
    .from(projects)
    .where(and(ne(projects.status, "done"), not(personalSql(projects.business))))
    .orderBy(asc(projects.createdAt));
  const projectIds = projectRows.map((p) => p.id);

  const taskRows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      projectId: tasks.projectId
    })
    .from(tasks)
    .where(
      and(
        isNull(tasks.parentTaskId),
        ne(tasks.status, "done"),
        projectIds.length
          ? or(isNull(tasks.projectId), inArray(tasks.projectId, projectIds))
          : isNull(tasks.projectId)
      )
    )
    .orderBy(asc(tasks.createdAt));
  const links = taskRows.length
    ? await db
        .select({ taskId: taskProjects.taskId, projectId: taskProjects.projectId })
        .from(taskProjects)
        .where(
          inArray(
            taskProjects.taskId,
            taskRows.map((t) => t.id)
          )
        )
    : [];

  // Ideas filed from the Inbox, newest first, unless they belong to a Personal project.
  const ideaRows = await db
    .select({
      id: captures.id,
      body: sql<string>`substr(${captures.body}, 1, 200)`,
      projectId: captures.projectId,
      filedAt: captures.filedAt
    })
    .from(captures)
    .leftJoin(projects, eq(captures.projectId, projects.id))
    .where(and(eq(captures.kind, "idea"), not(personalSql(projects.business))))
    .orderBy(desc(captures.createdAt));

  // Radar companies she is keeping: shortlisted first, then starred, most recent first.
  const companyRows = await db
    .select({
      id: companies.id,
      name: companies.name,
      status: companies.status,
      stage: companies.stage
    })
    .from(companies)
    .where(inArray(companies.status, ["shortlisted", "starred"]))
    .orderBy(
      sql`${companies.status} = 'starred'`,
      desc(companies.statusChangedAt),
      asc(companies.name)
    );
  const paths = await warmPathsFor(
    db,
    companyRows.map((c) => c.id)
  );
  const people: BusinessMapData["people"] = [];
  for (const [companyId, list] of paths) {
    for (const p of list) {
      people.push({
        companyId,
        contactId: p.contact.id,
        fullName: p.contact.fullName,
        position: p.contact.position ?? null,
        company: p.contact.company ?? null
      });
    }
  }

  // Grants on the board that are still in play.
  const grantRows = await db
    .select({
      id: grants.id,
      title: grants.title,
      status: grants.status,
      agency: grants.agency,
      deadline: grants.deadline
    })
    .from(grants)
    .where(inArray(grants.status, ["watching", "applying", "submitted"]))
    .orderBy(sql`${grants.deadline} is null`, asc(grants.deadline));

  return {
    businessName: profile?.name?.trim() || "Cultured Matter",
    projects: projectRows,
    tasks: taskRows.map((t) => ({
      ...t,
      alsoIn: links.filter((l) => l.taskId === t.id).map((l) => l.projectId)
    })),
    ideas: ideaRows,
    companies: companyRows,
    people,
    grants: grantRows.map((g) => ({ ...g, status: g.status ?? "watching" }))
  };
}

// ---------------------------------------------------------------- Saved mind maps

export const mindMapSchema = createSelectSchema(mindMaps, {
  nodes: mindMapNodes,
  edges: mindMapEdges
});
export type MindMap = z.infer<typeof mindMapSchema>;

const summarySchema = z.object({
  id: z.string(),
  title: z.string(),
  nodeCount: z.number(),
  edgeCount: z.number(),
  createdAt: z.date(),
  updatedAt: z.date()
});

// What a node's record link resolves to: its current name and where it opens, or missing when
// the record has since been deleted.
const linkedRecordSchema = z.object({
  type: z.enum(RECORD_TYPES),
  id: z.string(),
  title: z.string().nullable(),
  href: z.string().nullable(),
  missing: z.boolean()
});

type Resolved = { title: string; href: string };

// Looks up linked records, one query per record type in use.
async function resolveRecords(db: Executor, links: RecordLink[]) {
  const out = new Map<string, Resolved>();
  const byType = new Map<RecordType, string[]>();
  for (const l of links) {
    const list = byType.get(l.type) ?? [];
    if (!list.includes(l.id)) list.push(l.id);
    byType.set(l.type, list);
  }
  const put = (type: RecordType, rid: string, title: string, ctx = {}) =>
    out.set(recordKey({ type, id: rid }), {
      title,
      href: recordHref({ type, id: rid }, { title, ...ctx })
    });

  for (const [type, ids] of byType) {
    if (type === "project") {
      const rows = await db
        .select({ id: projects.id, title: projects.name })
        .from(projects)
        .where(inArray(projects.id, ids));
      for (const r of rows) put(type, r.id, r.title);
    } else if (type === "task") {
      const rows = await db
        .select({ id: tasks.id, title: tasks.title, projectId: tasks.projectId })
        .from(tasks)
        .where(inArray(tasks.id, ids));
      for (const r of rows) put(type, r.id, r.title, { projectId: r.projectId });
    } else if (type === "contact") {
      const rows = await db
        .select({ id: contacts.id, title: contacts.fullName })
        .from(contacts)
        .where(inArray(contacts.id, ids));
      for (const r of rows) put(type, r.id, r.title);
    } else if (type === "company") {
      const rows = await db
        .select({ id: companies.id, title: companies.name })
        .from(companies)
        .where(inArray(companies.id, ids));
      for (const r of rows) put(type, r.id, r.title);
    } else if (type === "grant") {
      const rows = await db
        .select({ id: grants.id, title: grants.title })
        .from(grants)
        .where(inArray(grants.id, ids));
      for (const r of rows) put(type, r.id, r.title);
    } else {
      const rows = await db
        .select({
          id: captures.id,
          title: sql<string>`substr(${captures.body}, 1, 120)`,
          filedAt: captures.filedAt
        })
        .from(captures)
        .where(and(inArray(captures.id, ids), eq(captures.kind, "idea")));
      for (const r of rows) put(type, r.id, r.title, { filed: !!r.filedAt });
    }
  }
  return out;
}

const linksOf = (nodes: MindMapNode[]) =>
  nodes.flatMap((n) => (n.link ? [{ type: n.link.type, id: n.link.id }] : []));

// New links must point at records that exist. Links already on the map are left alone, so a
// record deleted later doesn't stop her saving the map.
async function assertLinksExist(db: Executor, nodes: MindMapNode[], already: MindMapNode[] = []) {
  const known = new Set(linksOf(already).map(recordKey));
  const fresh = linksOf(nodes).filter((l) => !known.has(recordKey(l)));
  if (!fresh.length) return;
  const found = await resolveRecords(db, fresh);
  const missing = fresh.find((l) => !found.has(recordKey(l)));
  if (missing) {
    throw new ActionError(
      "invalid",
      `No ${RECORD_LABELS[missing.type].toLowerCase()} with id ${missing.id} to link to`
    );
  }
}

async function mustGetMap(db: Executor, mindMapId: string) {
  const [row] = await db.select().from(mindMaps).where(eq(mindMaps.id, mindMapId));
  if (!row) throw new ActionError("not_found", "Mind map not found");
  return row;
}

export const listMindMaps = defineAction({
  name: "listMindMaps",
  description:
    "List the saved mind maps (brainstorms, project plans, sponsor maps), most recently changed first, with how many nodes and links each has.",
  kind: "read",
  input: z.object({ limit }),
  output: z.object({ maps: z.array(summarySchema) }),
  async handler(input, db) {
    const maps = await db
      .select({
        id: mindMaps.id,
        title: mindMaps.title,
        nodeCount: sql<number>`json_array_length(${mindMaps.nodes})`,
        edgeCount: sql<number>`json_array_length(${mindMaps.edges})`,
        createdAt: mindMaps.createdAt,
        updatedAt: mindMaps.updatedAt
      })
      .from(mindMaps)
      .orderBy(desc(mindMaps.updatedAt), asc(mindMaps.title))
      .limit(input.limit);
    return { maps };
  }
});

export const getMindMap = defineAction({
  name: "getMindMap",
  description:
    "Get one saved mind map: its title, nodes (id, label, position, optional link to a real record) and edges (links between nodes). records gives each linked record's current name and where it opens; missing means the record was deleted.",
  kind: "read",
  input: z.object({ mindMapId: id }),
  output: z.object({ map: mindMapSchema, records: z.array(linkedRecordSchema) }),
  async handler(input, db) {
    const map = await mustGetMap(db, input.mindMapId);
    const links = linksOf(map.nodes);
    const found = await resolveRecords(db, links);
    const seen = new Set<string>();
    const records = links.flatMap((l) => {
      const key = recordKey(l);
      if (seen.has(key)) return [];
      seen.add(key);
      const r = found.get(key);
      return [{ ...l, title: r?.title ?? null, href: r?.href ?? null, missing: !r }];
    });
    return { map, records };
  }
});

const graphFields = {
  nodes: mindMapNodes.optional(),
  edges: mindMapEdges.optional()
};
const NODE_HELP =
  "Each node: { id (short unique text), label, x, y (canvas position in pixels; 0,0 is the centre), link (optional: { type: project | task | contact | company | grant | idea, id }) }. Each edge: { id, source, target } joining two node ids.";

export const createMindMap = defineAction({
  name: "createMindMap",
  description: `Create a saved mind map. Without nodes it starts with one node holding the title. ${NODE_HELP}`,
  kind: "write",
  input: z.object({ title: mindMapTitle, ...graphFields }).superRefine((v, ctx) => {
    if (v.edges?.length && !v.nodes?.length) {
      ctx.addIssue({ code: "custom", message: "Links need nodes to join" });
    }
    checkGraph({ nodes: v.nodes ?? [], edges: v.edges ?? [] }, ctx);
  }),
  output: mindMapSchema,
  async handler(input, db) {
    const graph = input.nodes?.length
      ? { nodes: input.nodes, edges: input.edges ?? [] }
      : starterGraph(input.title);
    await assertLinksExist(db, graph.nodes);
    const [row] = await db
      .insert(mindMaps)
      .values({ title: input.title, ...graph })
      .returning();
    return row;
  },
  log: (_input, map) => ({
    entityType: "mind_map",
    entityId: map.id,
    summary: `Created mind map "${map.title}"`,
    data: { nodes: map.nodes.length, edges: map.edges.length }
  })
});

export const updateMindMap = defineAction({
  name: "updateMindMap",
  description: `Change a saved mind map: its title, and/or its whole set of nodes and edges (send both together; they replace what is there). ${NODE_HELP}`,
  kind: "write",
  input: z
    .object({ mindMapId: id, title: mindMapTitle.optional(), ...graphFields })
    .superRefine((v, ctx) => {
      if ((v.nodes === undefined) !== (v.edges === undefined)) {
        ctx.addIssue({ code: "custom", message: "Send nodes and edges together" });
        return;
      }
      checkGraph(v, ctx);
    }),
  output: mindMapSchema,
  async handler(input, db) {
    const before = await mustGetMap(db, input.mindMapId);
    if (input.nodes) await assertLinksExist(db, input.nodes, before.nodes);
    const [row] = await db
      .update(mindMaps)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.nodes && input.edges && { nodes: input.nodes, edges: input.edges }),
        updatedAt: new Date()
      })
      .where(eq(mindMaps.id, input.mindMapId))
      .returning();
    return row;
  },
  log: (input, map) => ({
    entityType: "mind_map",
    entityId: map.id,
    summary: `Updated mind map "${map.title}"`,
    data: input.nodes ? { nodes: map.nodes.length, edges: map.edges.length } : undefined
  })
});

export const deleteMindMap = defineAction({
  name: "deleteMindMap",
  description:
    "Delete a saved mind map. The records its nodes link to are not touched. The live business map can't be deleted.",
  kind: "write",
  input: z.object({ mindMapId: id }),
  output: z.object({ id: z.string(), title: z.string() }),
  async handler(input, db) {
    const map = await mustGetMap(db, input.mindMapId);
    await db.delete(mindMaps).where(eq(mindMaps.id, map.id));
    return { id: map.id, title: map.title };
  },
  log: (_input, map) => ({
    entityType: "mind_map",
    entityId: map.id,
    summary: `Deleted mind map "${map.title}"`
  })
});
