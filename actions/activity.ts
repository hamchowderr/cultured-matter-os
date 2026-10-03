import { and, count, desc, eq, gte, inArray, like, lt } from "drizzle-orm";
import { z } from "zod/v4";

import type { Executor } from "@/db";
import {
  activityLog,
  approvals,
  captures,
  companies,
  contacts,
  grants,
  projects,
  taskProjects,
  tasks
} from "@/db/schema";
import { defineAction } from "./define";
import { limit, offset } from "./schemas";

// What the row points at, looked up now so the Archive can link to it. Null when the
// entity type has no page or the entity has since been deleted.
const entityRefSchema = z.object({
  name: z.string(),
  // For a project, itself; for a task, the project it sits in. projectDone mirrors its status.
  projectId: z.string().nullable(),
  projectDone: z.boolean(),
  // Captures only: filed captures live in the Inbox's "filed" view.
  filed: z.boolean()
});

export const activityEntrySchema = z.object({
  id: z.string(),
  at: z.date(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  summary: z.string(),
  entity: entityRefSchema.nullable()
});

export type ActivityEntry = z.infer<typeof activityEntrySchema>;
type EntityRef = z.infer<typeof entityRefSchema>;

const ref = (name: string, extra: Partial<EntityRef> = {}): EntityRef => ({
  name,
  projectId: null,
  projectDone: false,
  filed: false,
  ...extra
});

// One batched lookup per entity type on the page.
async function resolveEntities(
  db: Executor,
  rows: { entityType: string; entityId: string | null }[]
): Promise<Map<string, EntityRef>> {
  const ids = (type: string) => [
    ...new Set(rows.filter((r) => r.entityType === type && r.entityId).map((r) => r.entityId!))
  ];
  const out = new Map<string, EntityRef>();
  const key = (type: string, id: string) => `${type}:${id}`;

  const companyIds = ids("company");
  const contactIds = ids("contact");
  const grantIds = ids("grant");
  const projectIds = ids("project");
  const taskIds = ids("task");
  const captureIds = ids("capture");
  const approvalIds = ids("approval");

  const [companyRows, contactRows, grantRows, projectRows, taskRows, captureRows, approvalRows] =
    await Promise.all([
      companyIds.length
        ? db
            .select({ id: companies.id, name: companies.name })
            .from(companies)
            .where(inArray(companies.id, companyIds))
        : [],
      contactIds.length
        ? db
            .select({ id: contacts.id, name: contacts.fullName })
            .from(contacts)
            .where(inArray(contacts.id, contactIds))
        : [],
      grantIds.length
        ? db
            .select({ id: grants.id, name: grants.title })
            .from(grants)
            .where(inArray(grants.id, grantIds))
        : [],
      projectIds.length
        ? db
            .select({ id: projects.id, name: projects.name, status: projects.status })
            .from(projects)
            .where(inArray(projects.id, projectIds))
        : [],
      taskIds.length
        ? db
            .select({ id: tasks.id, name: tasks.title, projectId: tasks.projectId })
            .from(tasks)
            .where(inArray(tasks.id, taskIds))
        : [],
      captureIds.length
        ? db
            .select({ id: captures.id, name: captures.body, filedAt: captures.filedAt })
            .from(captures)
            .where(inArray(captures.id, captureIds))
        : [],
      // Only approvals still waiting are linkable: they are decided on Today.
      approvalIds.length
        ? db
            .select({ id: approvals.id, name: approvals.summary })
            .from(approvals)
            .where(and(inArray(approvals.id, approvalIds), eq(approvals.status, "pending")))
        : []
    ]);

  for (const r of companyRows) out.set(key("company", r.id), ref(r.name));
  for (const r of contactRows) out.set(key("contact", r.id), ref(r.name));
  for (const r of grantRows) out.set(key("grant", r.id), ref(r.name));
  for (const r of projectRows) {
    out.set(
      key("project", r.id),
      ref(r.name, { projectId: r.id, projectDone: r.status === "done" })
    );
  }
  for (const r of captureRows) out.set(key("capture", r.id), ref(r.name, { filed: !!r.filedAt }));
  for (const r of approvalRows) out.set(key("approval", r.id), ref(r.name));

  if (taskRows.length) {
    // A task without a home project may still be cross-linked into one.
    const loose = taskRows.filter((t) => !t.projectId).map((t) => t.id);
    const links = loose.length
      ? await db
          .select({ taskId: taskProjects.taskId, projectId: taskProjects.projectId })
          .from(taskProjects)
          .where(inArray(taskProjects.taskId, loose))
      : [];
    const projectOf = new Map<string, string>();
    for (const t of taskRows) if (t.projectId) projectOf.set(t.id, t.projectId);
    for (const l of links) if (!projectOf.has(l.taskId)) projectOf.set(l.taskId, l.projectId);

    const homeIds = [...new Set(projectOf.values())];
    const homes = homeIds.length
      ? await db
          .select({ id: projects.id, status: projects.status })
          .from(projects)
          .where(inArray(projects.id, homeIds))
      : [];
    const done = new Set(homes.filter((p) => p.status === "done").map((p) => p.id));

    for (const t of taskRows) {
      const projectId = projectOf.get(t.id) ?? null;
      out.set(
        key("task", t.id),
        ref(t.name, { projectId, projectDone: !!projectId && done.has(projectId) })
      );
    }
  }

  return out;
}

export const listActivity = defineAction({
  name: "listActivity",
  description:
    "The activity log: every change made in the app. Filter by entity type, a date range (from inclusive, to exclusive) or text in the summary. Newest first.",
  kind: "read",
  input: z.object({
    entityType: z.string().trim().min(1).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    query: z.string().trim().optional(),
    limit,
    offset
  }),
  output: z.object({ entries: z.array(activityEntrySchema), total: z.number() }),
  async handler(input, db) {
    const where = and(
      input.entityType ? eq(activityLog.entityType, input.entityType) : undefined,
      input.from ? gte(activityLog.at, input.from) : undefined,
      input.to ? lt(activityLog.at, input.to) : undefined,
      input.query ? like(activityLog.summary, `%${input.query}%`) : undefined
    );

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: activityLog.id,
          at: activityLog.at,
          action: activityLog.action,
          entityType: activityLog.entityType,
          entityId: activityLog.entityId,
          summary: activityLog.summary
        })
        .from(activityLog)
        .where(where)
        .orderBy(desc(activityLog.at), desc(activityLog.id))
        .limit(input.limit)
        .offset(input.offset),
      db.select({ total: count() }).from(activityLog).where(where)
    ]);

    const refs = await resolveEntities(db, rows);
    return {
      entries: rows.map((r) => ({
        ...r,
        entity: r.entityId ? (refs.get(`${r.entityType}:${r.entityId}`) ?? null) : null
      })),
      total
    };
  }
});
