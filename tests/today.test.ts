import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as A from "@/actions";
import type { Database } from "@/db";
import { startOfDayIn } from "@/lib/time";
import { freshDb } from "./test-db";

let db: Database;
let cleanup: () => void;
const ctx = () => ({ db });
beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
});
afterAll(() => cleanup());

const now = new Date(2026, 8, 22, 10, 0); // Sep 22, 10:00 local
const at = (days: number) => new Date(2026, 8, 22 + days, 12, 0);

describe("dueTasks", () => {
  it("splits open tasks into overdue, today and the next 7 days", async () => {
    const p = await A.createProject.run({ name: "Beauty series" }, ctx());
    await A.createTask.run({ title: "late", projectId: p.id, dueDate: at(-1) }, ctx());
    await A.createTask.run({ title: "today", projectId: p.id, dueDate: at(0) }, ctx());
    await A.createTask.run({ title: "in 3 days", projectId: p.id, dueDate: at(3) }, ctx());
    await A.createTask.run({ title: "in 7 days", projectId: p.id, dueDate: at(7) }, ctx());
    await A.createTask.run({ title: "in 9 days", projectId: p.id, dueDate: at(9) }, ctx());
    await A.createTask.run({ title: "no date", projectId: p.id }, ctx());
    const done = await A.createTask.run(
      { title: "done today", projectId: p.id, dueDate: at(0) },
      ctx()
    );
    await A.setTaskStatus.run({ taskId: done.id, status: "done" }, ctx());

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const r = await A.dueTasks.run({ now, timeZone }, ctx());
    expect(r.overdue.map((t) => t.title)).toEqual(["late"]);
    expect(r.today.map((t) => t.title)).toEqual(["today"]);
    expect(r.week.map((t) => t.title)).toEqual(["in 3 days", "in 7 days"]);
    expect(r.today[0].projectName).toBe("Beauty series");
  });
});

describe("startOfDayIn", () => {
  it("finds midnight in Los Angeles from a UTC instant", () => {
    // 2026-09-23 03:00 UTC is still Sep 22 in Los Angeles (UTC-7).
    const start = startOfDayIn("America/Los_Angeles", new Date("2026-09-23T03:00:00Z"));
    expect(start.toISOString()).toBe("2026-09-22T07:00:00.000Z");
  });
});

describe("listApprovals", () => {
  it("lists pending approvals oldest first", async () => {
    await A.requestApproval.run({ action: "sendEmail", summary: "First", payload: {} }, ctx());
    await new Promise((r) => setTimeout(r, 5));
    await A.requestApproval.run({ action: "sendEmail", summary: "Second", payload: {} }, ctx());
    const r = await A.listApprovals.run({}, ctx());
    expect(r.approvals.map((a) => a.summary)).toEqual(["First", "Second"]);
    expect((await A.listApprovals.run({ status: "approved" }, ctx())).approvals).toHaveLength(0);
  });
});
