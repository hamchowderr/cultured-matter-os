import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as A from "@/actions";
import type { Database } from "@/db";
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

  it("hides done projects unless asked", async () => {
    const p = await A.createProject.run({ name: "Old campaign" }, ctx());
    await A.updateProject.run({ projectId: p.id, status: "done" }, ctx());
    const active = await A.listProjects.run({}, ctx());
    expect(active.projects.some((x) => x.id === p.id)).toBe(false);
    const all = await A.listProjects.run({ includeDone: true }, ctx());
    expect(all.projects.some((x) => x.id === p.id)).toBe(true);
  });
});
