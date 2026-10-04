import { desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as A from "@/actions";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import { isPersonal, SUGGESTED_PERSONAL_PROJECTS } from "@/lib/personal";
import { getTour } from "@/lib/tours";
import { freshDb } from "./test-db";

let db: Database;
let cleanup: () => void;
const ctx = () => ({ db });
const USER = "user-simone";
const day = 86_400_000;

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
  await db.insert(t.users).values({ id: USER, name: "Simone", email: "simone@example.com" });
});
afterAll(() => cleanup());

const lastLog = async () =>
  (await db.select().from(t.activityLog).orderBy(desc(t.activityLog.at)).limit(1))[0];

describe("personal life admin", () => {
  it("defaults to All and remembers the switch per user", async () => {
    expect((await A.getUserSettings.run({ userId: USER }, ctx())).workScope).toBe("all");
    const r = await A.setWorkScope.run({ userId: USER, scope: "business" }, ctx());
    expect(r).toEqual({ workScope: "business", added: [] });
    expect((await A.getUserSettings.run({ userId: USER }, ctx())).workScope).toBe("business");
    expect((await lastLog()).action).toBe("setWorkScope");
  });

  it("adds the suggested personal projects on the first switch to Personal, once", async () => {
    await A.createProject.run({ name: "Beauty series" }, ctx());
    const first = await A.setWorkScope.run({ userId: USER, scope: "personal" }, ctx());
    expect(first.added).toEqual(SUGGESTED_PERSONAL_PROJECTS.map((p) => p.name));
    expect((await lastLog()).summary).toBe(
      "Switched to personal work, and added 5 suggested personal projects"
    );

    const { projects } = await A.listProjects.run({ scope: "personal" }, ctx());
    expect(projects.map((p) => p.name).sort()).toEqual(
      SUGGESTED_PERSONAL_PROJECTS.map((p) => p.name).sort()
    );
    expect(projects.every((p) => p.business === "Personal")).toBe(true);

    // Deleting them all never brings them back.
    for (const p of projects) await A.deleteProject.run({ projectId: p.id }, ctx());
    await A.setWorkScope.run({ userId: USER, scope: "all" }, ctx());
    const again = await A.setWorkScope.run({ userId: USER, scope: "personal" }, ctx());
    expect(again.added).toEqual([]);
    expect((await A.listProjects.run({ scope: "personal" }, ctx())).projects).toEqual([]);
  });

  it("does not seed when she already has a personal project", async () => {
    const other = "user-other";
    await db.insert(t.users).values({ id: other, name: "Other", email: "other@example.com" });
    await A.createProject.run({ name: "Garden", business: "Personal" }, ctx());
    const r = await A.setWorkScope.run({ userId: other, scope: "personal" }, ctx());
    expect(r.added).toEqual([]);
  });

  it("narrows projects, tasks and due tasks by scope", async () => {
    const now = new Date();
    const work = await A.createProject.run({ name: "Grant push" }, ctx());
    const [garden] = (await A.listProjects.run({ scope: "personal" }, ctx())).projects;
    const workTask = await A.createTask.run(
      { title: "Send deck", projectId: work.id, dueDate: new Date(now.getTime() + day) },
      ctx()
    );
    const homeTask = await A.createTask.run(
      { title: "Meal prep", projectId: garden.id, dueDate: new Date(now.getTime() + day) },
      ctx()
    );
    const loose = await A.createTask.run(
      { title: "Loose end", dueDate: new Date(now.getTime() + day) },
      ctx()
    );

    const titles = async (scope: "business" | "personal" | "all") =>
      (await A.listTasks.run({ scope }, ctx())).tasks.map((x) => x.title).sort();
    expect(await titles("personal")).toEqual(["Meal prep"]);
    // A task with no project counts as business.
    expect(await titles("business")).toEqual(["Loose end", "Send deck"]);
    expect(await titles("all")).toEqual(["Loose end", "Meal prep", "Send deck"]);

    const due = await A.dueTasks.run({ scope: "personal", now }, ctx());
    const dueAll = [...due.overdue, ...due.today, ...due.week];
    expect(dueAll.map((x) => x.id)).toEqual([homeTask.id]);
    expect(dueAll[0].personal).toBe(true);
    const everything = await A.dueTasks.run({ now }, ctx());
    const flat = [...everything.overdue, ...everything.today, ...everything.week];
    expect(flat.find((x) => x.id === workTask.id)?.personal).toBe(false);
    expect(flat.find((x) => x.id === loose.id)?.personal).toBe(false);

    const business = (await A.listProjects.run({ scope: "business" }, ctx())).projects;
    expect(business.some((p) => isPersonal(p.business))).toBe(false);
  });

  it("refuses to delete a project that still has tasks", async () => {
    const [garden] = (await A.listProjects.run({ scope: "personal" }, ctx())).projects;
    await expect(A.deleteProject.run({ projectId: garden.id }, ctx())).rejects.toThrow(
      /still has tasks/
    );
  });

  it("puts personal due dates in the calendar feed, labeled", async () => {
    const { calendarToken } = await A.resetCalendarLink.run({ userId: USER }, ctx());
    const feed = await A.calendarFeed.run({ token: calendarToken }, ctx());
    const meal = feed!.events.find((e) => e.title.includes("Meal prep"))!;
    expect(meal.title).toBe("Due (personal): Meal prep");
    expect(meal.description).toBe("Personal project: Garden");
    const deck = feed!.events.find((e) => e.title.includes("Send deck"))!;
    expect(deck.title).toBe("Due: Send deck");
  });

  it("labels replies on personal tasks in the bell and the daily summary", async () => {
    const [garden] = (await A.listProjects.run({ scope: "personal" }, ctx())).projects;
    const task = await A.createTask.run(
      { title: "Book River's swim class", projectId: garden.id },
      ctx()
    );
    await db
      .update(t.tasks)
      .set({ status: "replied", emailThreadId: "thread-1" })
      .where(eq(t.tasks.id, task.id));

    const { items } = await A.listNotifications.run({ userId: USER }, ctx());
    expect(items.find((i) => i.id === `reply:${task.id}`)?.title).toBe("Reply arrived (personal)");

    const summary = await A.dailySummary.run(
      { userId: USER, since: new Date(Date.now() - day) },
      ctx()
    );
    expect(summary.replies).toContainEqual(
      expect.objectContaining({ title: "Reply arrived (personal)", detail: task.title })
    );
  });

  it("mentions the switch in the Today and Projects tours", () => {
    expect(getTour("today")!.steps.some((s) => s.variants[0].target === "today-scope")).toBe(true);
    expect(getTour("projects")!.steps.some((s) => s.variants[0].target === "projects-scope")).toBe(
      true
    );
  });
});
