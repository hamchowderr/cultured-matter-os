import type { dueTasks, getProject, listProjects, listTasks } from "@/actions/server";

type Data<F extends (...args: never[]) => Promise<{ ok: boolean }>> = Extract<
  Awaited<ReturnType<F>>,
  { ok: true; data: unknown }
>["data"];

export type ProjectSummary = Data<typeof listProjects>["projects"][number];
export type ProjectDetail = Data<typeof getProject>;
// A task as the task sheet edits it: seen from one project, or from no project.
export type ProjectTask = ProjectDetail["tasks"][number];
export type TaskRow = Data<typeof listTasks>["tasks"][number];
export type DueTask = Data<typeof dueTasks>["overdue"][number];
export type DueTasks = Data<typeof dueTasks>;
export type TaskStatus = TaskRow["status"];

// "2026-09-30" from a date input → that day at local noon.
export function fromDateInput(value: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null;
}

// The task as the sheet expects it. Inside a project, a task whose home is elsewhere is "linked".
export function toSheetTask(row: TaskRow, projectId: string | null): ProjectTask {
  const linked = !!projectId && row.projectId !== projectId;
  const alsoIn = row.alsoIn.filter((p) => p.id !== projectId);
  if (linked && row.projectId) {
    alsoIn.unshift({ id: row.projectId, name: row.projectName ?? "Another project" });
  }
  return { ...row, linked, alsoIn };
}

// Every project a task shows up in: its home and the ones it is linked into.
export const projectIdsOf = (row: TaskRow) =>
  [row.projectId, ...row.alsoIn.map((p) => p.id)].filter((id): id is string => !!id);

export const projectProgress = (p: ProjectSummary) => {
  const total = p.open + p.done;
  return total ? Math.round((p.done / total) * 100) : 0;
};
