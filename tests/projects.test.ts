import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { and, eq } from "drizzle-orm";

import * as A from "@/actions";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import { projectStats, taskActivity } from "@/lib/project-stats";
import { freshDb } from "./test-db";

let db: Database;
let cleanup: () => void;
const ctx = () => ({ db });
beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
});
afterAll(() => cleanup());

const day = 86_400_000;

describe("projects and tasks", () => {
  it("builds business → project → task → subtask and counts per project", async () => {
    const beauty = await A.createProject.run({ name: "Beauty series" }, ctx());
    const personal = await A.createProject.run({ name: "Website", business: "Personal" }, ctx());
    expect(beauty.business).toBe("Cultured Matter");

    const intro = await A.createTask.run(
      { title: "Ask Jordan for an intro", projectId: beauty.id, status: "waiting" },
      ctx()
    );
    await A.createTask.run(
      { title: "Draft pitch", projectId: beauty.id, dueDate: new Date(Date.now() - 2 * day) },
      ctx()
    );
    const done = await A.createTask.run({ title: "Book studio", projectId: beauty.id }, ctx());
    await A.setTaskStatus.run({ taskId: done.id, status: "done" }, ctx());
    await A.createTask.run(
      { title: "Send deck", projectId: beauty.id, parentTaskId: intro.id },
      ctx()
    );

    const { projects } = await A.listProjects.run({}, ctx());
    expect(projects.map((p) => `${p.business}/${p.name}`)).toEqual([
      "Cultured Matter/Beauty series",
      "Personal/Website"
    ]);
    expect(projects[0]).toMatchObject({ open: 2, waiting: 1, overdue: 1, done: 1 });
    expect(projects[1]).toMatchObject({ open: 0, done: 0 });

    const detail = await A.getProject.run({ projectId: beauty.id }, ctx());
    expect(detail.tasks.map((t) => t.title)).toEqual([
      "Draft pitch",
      "Ask Jordan for an intro",
      "Book studio"
    ]);
    expect(detail.tasks.find((t) => t.id === intro.id)!.subtasks.map((s) => s.title)).toEqual([
      "Send deck"
    ]);
    expect(personal.id).toBeTruthy();
  });

  it("cross-links a task into another project without moving it", async () => {
    const { projects } = await A.listProjects.run({}, ctx());
    const [beauty, website] = projects;
    const [task] = (await A.getProject.run({ projectId: beauty.id }, ctx())).tasks;

    await A.linkTaskToProject.run({ taskId: task.id, projectId: website.id }, ctx());
    const inWebsite = await A.getProject.run({ projectId: website.id }, ctx());
    expect(inWebsite.tasks).toHaveLength(1);
    expect(inWebsite.tasks[0]).toMatchObject({ id: task.id, linked: true });
    expect(inWebsite.tasks[0].alsoIn.map((p) => p.name)).toEqual(["Beauty series"]);

    const inBeauty = await A.getProject.run({ projectId: beauty.id }, ctx());
    const home = inBeauty.tasks.find((t) => t.id === task.id)!;
    expect(home.linked).toBe(false);
    expect(home.alsoIn.map((p) => p.name)).toEqual(["Website"]);

    await expect(
      A.linkTaskToProject.run({ taskId: task.id, projectId: beauty.id }, ctx())
    ).rejects.toThrow(/already belongs/);

    const un = await A.unlinkTaskFromProject.run({ taskId: task.id, projectId: website.id }, ctx());
    expect(un.removed).toBe(true);
    expect((await A.getProject.run({ projectId: website.id }, ctx())).tasks).toHaveLength(0);
  });

  it("edits a task and clears its due date", async () => {
    const t = await A.createTask.run({ title: "Old", dueDate: new Date() }, ctx());
    const edited = await A.updateTask.run(
      { taskId: t.id, title: "New title", notes: "details", dueDate: null },
      ctx()
    );
    expect(edited).toMatchObject({ title: "New title", notes: "details", dueDate: null });
  });

  it("sets priority on create and edit, defaults to medium, and logs the change", async () => {
    const plain = await A.createTask.run({ title: "Plain" }, ctx());
    expect(plain.priority).toBe("medium");
    const hot = await A.createTask.run({ title: "Hot", priority: "urgent" }, ctx());
    expect(hot.priority).toBe("urgent");
    await expect(
      A.createTask.run({ title: "Bad", priority: "critical" } as never, ctx())
    ).rejects.toThrow();

    const lowered = await A.updateTask.run({ taskId: hot.id, priority: "low" }, ctx());
    expect(lowered.priority).toBe("low");
    // Other edits leave priority alone.
    const renamed = await A.updateTask.run({ taskId: hot.id, title: "Warm" }, ctx());
    expect(renamed.priority).toBe("low");

    const entries = await db
      .select({ summary: t.activityLog.summary, data: t.activityLog.data })
      .from(t.activityLog)
      .where(and(eq(t.activityLog.action, "updateTask"), eq(t.activityLog.entityId, hot.id)));
    expect(entries).toContainEqual({
      summary: 'Set "Hot" to low priority',
      data: { priority: "low" }
    });
    expect(entries).toContainEqual({ summary: 'Updated task "Warm"', data: null });

    const listed = await A.listTasks.run({}, ctx());
    expect(listed.tasks.find((x) => x.id === hot.id)?.priority).toBe("low");
    expect(listed.tasks.find((x) => x.id === plain.id)?.priority).toBe("medium");
  });

  it("returns priority from dueTasks and tasksDueBetween", async () => {
    const now = new Date("2031-03-10T12:00:00Z");
    const due = await A.createTask.run(
      { title: "Due soon", priority: "high", dueDate: new Date(now.getTime() + day) },
      ctx()
    );
    const { today, week } = await A.dueTasks.run({ now, timeZone: "UTC" }, ctx());
    expect([...today, ...week].find((x) => x.id === due.id)?.priority).toBe("high");
    const between = await A.tasksDueBetween.run(
      { from: now, to: new Date(now.getTime() + 3 * day) },
      ctx()
    );
    expect(between.tasks.find((x) => x.id === due.id)?.priority).toBe("high");
  });

  it("hides done projects unless asked", async () => {
    const p = await A.createProject.run({ name: "Old campaign" }, ctx());
    await A.updateProject.run({ projectId: p.id, status: "done" }, ctx());
    const active = await A.listProjects.run({}, ctx());
    expect(active.projects.some((x) => x.id === p.id)).toBe(false);
    const all = await A.listProjects.run({ includeDone: true }, ctx());
    expect(all.projects.some((x) => x.id === p.id)).toBe(true);
  });

  it("lists every top-level task with its project, links and subtasks", async () => {
    const home = await A.createProject.run({ name: "Launch", business: "Lab" }, ctx());
    const other = await A.createProject.run({ name: "Press", business: "Lab" }, ctx());
    const parent = await A.createTask.run({ title: "Book venue", projectId: home.id }, ctx());
    await A.createTask.run(
      { title: "Call caterer", projectId: home.id, parentTaskId: parent.id },
      ctx()
    );
    await A.linkTaskToProject.run({ taskId: parent.id, projectId: other.id }, ctx());
    const finished = await A.createTask.run({ title: "Pick date", projectId: home.id }, ctx());
    await A.setTaskStatus.run({ taskId: finished.id, status: "done" }, ctx());

    const { tasks } = await A.listTasks.run({}, ctx());
    const row = tasks.find((t) => t.id === parent.id)!;
    expect(row).toMatchObject({ projectName: "Launch", business: "Lab" });
    expect(row.alsoIn.map((p) => p.name)).toEqual(["Press"]);
    expect(row.subtasks.map((s) => s.title)).toEqual(["Call caterer"]);
    expect(tasks.some((t) => t.title === "Call caterer")).toBe(false);
    expect(tasks.some((t) => t.id === finished.id)).toBe(true);
    // Open tasks come before done ones.
    expect(tasks.findIndex((t) => t.id === finished.id)).toBeGreaterThan(
      tasks.findIndex((t) => t.id === parent.id)
    );

    const open = await A.listTasks.run({ includeDone: false }, ctx());
    expect(open.tasks.some((t) => t.id === finished.id)).toBe(false);
  });
});

describe("project overview numbers", () => {
  const tz = "America/Los_Angeles";
  // 2026-10-15 12:00 in Los Angeles.
  const now = new Date("2026-10-15T19:00:00Z");
  const task = (
    status: "todo" | "in_progress" | "waiting" | "replied" | "done",
    createdAt: string,
    completedAt: string | null = null
  ) => ({
    status,
    createdAt: new Date(createdAt),
    completedAt: completedAt ? new Date(completedAt) : null
  });

  it("counts projects, waiting, due and done this month in Simone's time zone", () => {
    const stats = projectStats(
      [{ status: "active" }, { status: "active" }, { status: "paused" }, { status: "done" }],
      [
        task("waiting", "2026-10-01T18:00:00Z"),
        task("replied", "2026-10-01T18:00:00Z"),
        // 1 Oct 01:00 UTC is still 30 Sep in Los Angeles: last month.
        task("done", "2026-09-01T18:00:00Z", "2026-10-01T01:00:00Z"),
        task("done", "2026-09-01T18:00:00Z", "2026-10-02T18:00:00Z"),
        // Reopened: completedAt is cleared, so it counts nowhere.
        task("todo", "2026-09-01T18:00:00Z")
      ],
      { overdue: [1], today: [1, 2], week: [1] },
      now,
      tz
    );
    expect(stats).toEqual({
      activeProjects: 2,
      pausedProjects: 1,
      dueThisWeek: 3,
      overdue: 1,
      waiting: 1,
      replied: 1,
      doneThisMonth: 1,
      doneLastMonth: 1
    });
  });

  it("buckets tasks added and finished per day", () => {
    const points = taskActivity(
      [
        task("done", "2026-10-14T18:00:00Z", "2026-10-15T18:00:00Z"),
        task("todo", "2026-10-15T06:00:00Z"), // 14 Oct, 23:00 in Los Angeles
        task("todo", "2026-01-01T18:00:00Z") // outside the window
      ],
      7,
      now,
      tz
    );
    expect(points).toHaveLength(7);
    expect(points.at(-1)).toEqual({ date: "2026-10-15", created: 0, completed: 1 });
    expect(points.at(-2)).toEqual({ date: "2026-10-14", created: 2, completed: 0 });
    expect(points[0].date).toBe("2026-10-09");
  });
});
