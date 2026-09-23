import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod/v4";

import type { Executor } from "@/db";
import { projects, taskProjects, tasks } from "@/db/schema";
import { ActionError, defineAction } from "./define";
import { id, projectSchema, taskSchema } from "./schemas";

const projectStatus = z.enum(["active", "paused", "done"]);
const name = z.string().trim().min(1).max(200);

async function mustGetProject(db: Executor, projectId: string) {
  const [row] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!row) throw new ActionError("not_found", "Project not found");
  return row;
}

async function mustGetTask(db: Executor, taskId: string) {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!row) throw new ActionError("not_found", "Task not found");
  return row;
}

export const listProjects = defineAction({
  name: "listProjects",
  description:
    "All projects grouped by business, with counts of open, waiting, overdue and done tasks.",
  kind: "read",
  input: z.object({ includeDone: z.boolean().default(false) }),
  output: z.object({
    projects: z.array(
      projectSchema.extend({
        open: z.number(),
        waiting: z.number(),
        overdue: z.number(),
        done: z.number()
      })
    )
  }),
  async handler(input, db) {
    const now = new Date();
    const counts = db
      .select({
        projectId: tasks.projectId,
        open: sql<number>`sum(${tasks.status} != 'done')`.as("open"),
        waiting: sql<number>`sum(${tasks.status} = 'waiting')`.as("waiting"),
        overdue:
          sql<number>`sum(${tasks.status} != 'done' and ${tasks.dueDate} < ${now.getTime()})`.as(
            "overdue"
          ),
        done: sql<number>`sum(${tasks.status} = 'done')`.as("done")
      })
      .from(tasks)
      .where(isNull(tasks.parentTaskId))
      .groupBy(tasks.projectId)
      .as("counts");

    const rows = await db
      .select({
        project: projects,
        open: sql<number>`coalesce(${counts.open}, 0)`,
        waiting: sql<number>`coalesce(${counts.waiting}, 0)`,
        overdue: sql<number>`coalesce(${counts.overdue}, 0)`,
        done: sql<number>`coalesce(${counts.done}, 0)`
      })
      .from(projects)
      .leftJoin(counts, eq(counts.projectId, projects.id))
      .where(input.includeDone ? undefined : ne(projects.status, "done"))
      .orderBy(asc(projects.business), asc(projects.name));

    return {
      projects: rows.map((r) => ({
        ...r.project,
        open: Number(r.open),
        waiting: Number(r.waiting),
        overdue: Number(r.overdue),
        done: Number(r.done)
      }))
    };
  }
});

const projectTaskSchema = taskSchema.extend({
  // True when the task lives in another project and is linked here.
  linked: z.boolean(),
  // Other projects this task also appears in.
  alsoIn: z.array(z.object({ id: z.string(), name: z.string() })),
  subtasks: z.array(taskSchema)
});

export const getProject = defineAction({
  name: "getProject",
  description:
    "One project with its tasks (its own and ones linked from other projects), each with subtasks and the other projects it appears in.",
  kind: "read",
  input: z.object({ projectId: id }),
  output: z.object({ project: projectSchema, tasks: z.array(projectTaskSchema) }),
  async handler(input, db) {
    const project = await mustGetProject(db, input.projectId);
    const linkedIds = (
      await db
        .select({ taskId: taskProjects.taskId })
        .from(taskProjects)
        .where(eq(taskProjects.projectId, project.id))
    ).map((r) => r.taskId);

    const top = await db
      .select()
      .from(tasks)
      .where(
        and(
          isNull(tasks.parentTaskId),
          or(
            eq(tasks.projectId, project.id),
            linkedIds.length ? inArray(tasks.id, linkedIds) : undefined
          )
        )
      )
      .orderBy(
        sql`${tasks.status} = 'done'`,
        sql`${tasks.dueDate} is null`,
        asc(tasks.dueDate),
        asc(tasks.createdAt)
      );
    if (top.length === 0) return { project, tasks: [] };

    const ids = top.map((t) => t.id);
    const [subs, links] = await Promise.all([
      db.select().from(tasks).where(inArray(tasks.parentTaskId, ids)).orderBy(asc(tasks.createdAt)),
      db
        .select({ taskId: taskProjects.taskId, id: projects.id, name: projects.name })
        .from(taskProjects)
        .innerJoin(projects, eq(taskProjects.projectId, projects.id))
        .where(inArray(taskProjects.taskId, ids))
    ]);
    const homes = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(
        inArray(
          projects.id,
          top.map((t) => t.projectId).filter((p): p is string => !!p)
        )
      );
    const homeName = new Map(homes.map((h) => [h.id, h.name]));

    return {
      project,
      tasks: top.map((t) => {
        const others = links
          .filter((l) => l.taskId === t.id && l.id !== project.id)
          .map(({ id, name }) => ({ id, name }));
        if (t.projectId && t.projectId !== project.id) {
          others.unshift({ id: t.projectId, name: homeName.get(t.projectId) ?? "Another project" });
        }
        return {
          ...t,
          linked: t.projectId !== project.id,
          alsoIn: others,
          subtasks: subs.filter((s) => s.parentTaskId === t.id)
        };
      })
    };
  }
});

export const createProject = defineAction({
  name: "createProject",
  description: "Create a project under a business (Cultured Matter unless another is given).",
  kind: "write",
  input: z.object({
    name,
    business: z.string().trim().min(1).max(120).default("Cultured Matter"),
    description: z.string().trim().max(2000).optional()
  }),
  output: projectSchema,
  async handler(input, db) {
    const [row] = await db.insert(projects).values(input).returning();
    return row;
  },
  log: (_input, p) => ({
    entityType: "project",
    entityId: p.id,
    summary: `Created project ${p.name} (${p.business})`
  })
});

export const updateProject = defineAction({
  name: "updateProject",
  description:
    "Rename a project, move it to another business, edit its description, or mark it paused or done.",
  kind: "write",
  input: z.object({
    projectId: id,
    name: name.optional(),
    business: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    status: projectStatus.optional()
  }),
  output: projectSchema,
  async handler({ projectId, ...patch }, db) {
    await mustGetProject(db, projectId);
    const [row] = await db
      .update(projects)
      .set(patch)
      .where(eq(projects.id, projectId))
      .returning();
    return row;
  },
  log: (input, p) => ({
    entityType: "project",
    entityId: p.id,
    summary: input.status ? `Marked project ${p.name} ${input.status}` : `Updated project ${p.name}`
  })
});

export const updateTask = defineAction({
  name: "updateTask",
  description: "Edit a task: title, notes, due date (null clears it) or home project.",
  kind: "write",
  input: z.object({
    taskId: id,
    title: name.optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    projectId: id.nullable().optional()
  }),
  output: taskSchema,
  async handler({ taskId, ...patch }, db) {
    await mustGetTask(db, taskId);
    if (patch.projectId) await mustGetProject(db, patch.projectId);
    const [row] = await db.update(tasks).set(patch).where(eq(tasks.id, taskId)).returning();
    return row;
  },
  log: (_input, t) => ({ entityType: "task", entityId: t.id, summary: `Updated task "${t.title}"` })
});

export const linkTaskToProject = defineAction({
  name: "linkTaskToProject",
  description: "Show an existing task in another project as well as its home project.",
  kind: "write",
  input: z.object({ taskId: id, projectId: id }),
  output: z.object({
    taskId: z.string(),
    projectId: z.string(),
    projectName: z.string(),
    taskTitle: z.string()
  }),
  async handler(input, db) {
    const [task, project] = await Promise.all([
      mustGetTask(db, input.taskId),
      mustGetProject(db, input.projectId)
    ]);
    if (task.projectId === project.id) {
      throw new ActionError("conflict", "The task already belongs to this project");
    }
    await db.insert(taskProjects).values(input).onConflictDoNothing();
    return { ...input, projectName: project.name, taskTitle: task.title };
  },
  log: (_input, r) => ({
    entityType: "task",
    entityId: r.taskId,
    summary: `Linked "${r.taskTitle}" to ${r.projectName}`
  })
});

export const unlinkTaskFromProject = defineAction({
  name: "unlinkTaskFromProject",
  description:
    "Remove a linked task from a project it was linked into. Its home project is unchanged.",
  kind: "write",
  input: z.object({ taskId: id, projectId: id }),
  output: z.object({ taskId: z.string(), projectId: z.string(), removed: z.boolean() }),
  async handler(input, db) {
    const removed = await db
      .delete(taskProjects)
      .where(
        and(eq(taskProjects.taskId, input.taskId), eq(taskProjects.projectId, input.projectId))
      )
      .returning();
    return { ...input, removed: removed.length > 0 };
  },
  log: (input) => ({
    entityType: "task",
    entityId: input.taskId,
    summary: "Unlinked a task from a project"
  })
});
