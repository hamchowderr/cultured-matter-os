import { and, count, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod/v4";

import { approvals, captures, projects, tasks } from "@/db/schema";
import type { Executor } from "@/db";
import { ActionError, defineAction } from "./define";
import { approvalSchema, captureSchema, id, taskSchema } from "./schemas";

const taskStatus = z.enum(["todo", "in_progress", "waiting", "done"]);

const newTask = z.object({
  title: z.string().trim().min(1).max(300),
  projectId: id.optional(),
  parentTaskId: id.optional(),
  notes: z.string().trim().max(5000).optional(),
  status: taskStatus.default("todo"),
  dueDate: z.coerce.date().optional()
});

async function assertExists(
  db: Executor,
  table: typeof projects | typeof tasks,
  rowId: string,
  label: string
) {
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.id, rowId));
  if (!row) throw new ActionError("not_found", `${label} not found`);
}

async function insertTask(db: Executor, input: z.output<typeof newTask>, captureId?: string) {
  if (input.projectId) await assertExists(db, projects, input.projectId, "Project");
  if (input.parentTaskId) await assertExists(db, tasks, input.parentTaskId, "Parent task");
  const [row] = await db
    .insert(tasks)
    .values({
      ...input,
      captureId,
      completedAt: input.status === "done" ? new Date() : null
    })
    .returning();
  return row;
}

export const createCapture = defineAction({
  name: "createCapture",
  description: "Capture a note into the Inbox to sort later.",
  kind: "write",
  input: z.object({ body: z.string().trim().min(1).max(10_000) }),
  output: captureSchema,
  async handler(input, db) {
    const [row] = await db.insert(captures).values({ body: input.body }).returning();
    return row;
  },
  log: (_input, capture) => ({
    entityType: "capture",
    entityId: capture.id,
    summary: `Captured "${capture.body.slice(0, 60)}"`
  })
});

export const classifyCapture = defineAction({
  name: "classifyCapture",
  description:
    "File an Inbox item as a task, idea or reference, with a tier (1 to 3) and optional project. Filing a task also creates it in Projects.",
  kind: "write",
  input: z.object({
    captureId: id,
    kind: z.enum(["task", "idea", "reference"]),
    tier: z.number().int().min(1).max(3),
    projectId: id.optional()
  }),
  output: z.object({ capture: captureSchema, task: taskSchema.nullable() }),
  async handler(input, db) {
    const [existing] = await db.select().from(captures).where(eq(captures.id, input.captureId));
    if (!existing) throw new ActionError("not_found", "Inbox item not found");
    // A task needs a project so it shows up in Projects.
    if (input.kind === "task" && !input.projectId) {
      throw new ActionError("invalid", "Choose a project for this task");
    }
    if (input.projectId) await assertExists(db, projects, input.projectId, "Project");
    const [already] = await db.select().from(tasks).where(eq(tasks.captureId, input.captureId));

    const [capture] = await db
      .update(captures)
      .set({
        kind: input.kind,
        tier: input.tier,
        projectId: input.projectId ?? null,
        filedAt: new Date()
      })
      .where(eq(captures.id, input.captureId))
      .returning();

    // Re-filing an item that already made a task keeps that one task.
    const task =
      input.kind !== "task"
        ? null
        : (already ??
          (await insertTask(
            db,
            newTask.parse({ title: existing.body.slice(0, 300), projectId: input.projectId }),
            capture.id
          )));
    return { capture, task };
  },
  log: (input, { capture, task }) => ({
    entityType: "capture",
    entityId: capture.id,
    summary: `Filed "${capture.body.slice(0, 60)}" as ${input.kind}, tier ${input.tier}`,
    data: task ? { taskId: task.id } : undefined
  })
});

export const createTask = defineAction({
  name: "createTask",
  description: "Create a task, optionally in a project, as a subtask, or with a due date.",
  kind: "write",
  input: newTask,
  output: taskSchema,
  handler: (input, db) => insertTask(db, input),
  log: (_input, task) => ({
    entityType: "task",
    entityId: task.id,
    summary: `Created task "${task.title}"`
  })
});

export const setTaskStatus = defineAction({
  name: "setTaskStatus",
  description: "Set a task's status: todo, in progress, waiting for response, or done.",
  kind: "write",
  input: z.object({ taskId: id, status: taskStatus }),
  output: taskSchema,
  async handler(input, db) {
    const [row] = await db
      .update(tasks)
      .set({ status: input.status, completedAt: input.status === "done" ? new Date() : null })
      .where(eq(tasks.id, input.taskId))
      .returning();
    if (!row) throw new ActionError("not_found", "Task not found");
    return row;
  },
  log: (input, task) => ({
    entityType: "task",
    entityId: task.id,
    summary: `Set "${task.title}" to ${input.status.replace("_", " ")}`
  })
});

export const requestApproval = defineAction({
  name: "requestApproval",
  description:
    "Queue an action for Simone to approve or reject before it runs. Payload holds the action's input.",
  kind: "write",
  input: z.object({
    action: z.string().min(1),
    summary: z.string().trim().min(1).max(500),
    payload: z.record(z.string(), z.unknown())
  }),
  output: approvalSchema,
  async handler(input, db) {
    const [row] = await db.insert(approvals).values(input).returning();
    return row;
  },
  log: (_input, approval) => ({
    entityType: "approval",
    entityId: approval.id,
    summary: `Requested approval: ${approval.summary}`
  })
});

export const decideApproval = defineAction({
  name: "decideApproval",
  description:
    "Approve or reject a pending approval, with an optional note. Records the decision only; an approval can be decided once.",
  kind: "write",
  input: z.object({
    approvalId: id,
    decision: z.enum(["approve", "reject"]),
    note: z.string().trim().max(500).optional()
  }),
  output: approvalSchema,
  async handler(input, db) {
    // Only a pending row matches, so two decisions on the same item cannot both win.
    const [row] = await db
      .update(approvals)
      .set({
        status: input.decision === "approve" ? "approved" : "rejected",
        decidedAt: new Date()
      })
      .where(and(eq(approvals.id, input.approvalId), eq(approvals.status, "pending")))
      .returning();
    if (row) {
      // Later: carry out the approved action per kind (row.action), e.g. Outlook drafts or chat.
      return row;
    }
    const [existing] = await db
      .select({ status: approvals.status })
      .from(approvals)
      .where(eq(approvals.id, input.approvalId));
    if (!existing) throw new ActionError("not_found", "Approval not found");
    throw new ActionError("conflict", `This approval was already ${existing.status}`);
  },
  log: (input, approval) => ({
    entityType: "approval",
    entityId: approval.id,
    summary: `${input.decision === "approve" ? "Approved" : "Rejected"}: ${approval.summary}`,
    data: input.note ? { note: input.note } : undefined
  })
});

export const listCaptures = defineAction({
  name: "listCaptures",
  description:
    "Inbox items: unfiled ones newest first, or filed ones filtered by kind, tier or project.",
  kind: "read",
  input: z.object({
    filed: z.boolean().default(false),
    kind: z.enum(["task", "idea", "reference"]).optional(),
    tier: z.number().int().min(1).max(3).optional(),
    projectId: id.optional(),
    limit: z.number().int().min(1).max(200).default(100)
  }),
  output: z.object({
    captures: z.array(captureSchema.extend({ projectName: z.string().nullable() })),
    unfiled: z.number()
  }),
  async handler(input, db) {
    const rows = await db
      .select({ capture: captures, projectName: projects.name })
      .from(captures)
      .leftJoin(projects, eq(captures.projectId, projects.id))
      .where(
        and(
          input.filed ? isNotNull(captures.filedAt) : isNull(captures.filedAt),
          input.kind ? eq(captures.kind, input.kind) : undefined,
          input.tier ? eq(captures.tier, input.tier) : undefined,
          input.projectId ? eq(captures.projectId, input.projectId) : undefined
        )
      )
      .orderBy(desc(input.filed ? captures.filedAt : captures.createdAt))
      .limit(input.limit);
    const [{ n }] = await db.select({ n: count() }).from(captures).where(isNull(captures.filedAt));
    return {
      captures: rows.map((r) => ({ ...r.capture, projectName: r.projectName })),
      unfiled: n
    };
  }
});

export const listApprovals = defineAction({
  name: "listApprovals",
  description: "Approval requests, pending first by default; oldest pending at the top.",
  kind: "read",
  input: z.object({
    status: z.enum(["pending", "approved", "rejected"]).default("pending"),
    limit: z.number().int().min(1).max(200).default(50)
  }),
  output: z.object({ approvals: z.array(approvalSchema) }),
  async handler(input, db) {
    const rows = await db
      .select()
      .from(approvals)
      .where(eq(approvals.status, input.status))
      .orderBy(input.status === "pending" ? approvals.createdAt : desc(approvals.decidedAt))
      .limit(input.limit);
    return { approvals: rows };
  }
});
