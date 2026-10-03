import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as A from "@/actions";
import { ActionError } from "@/actions";
import type { Database } from "@/db";
import * as t from "@/db/schema";
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

describe("decideApproval", () => {
  const request = (summary: string) =>
    A.requestApproval.run({ action: "sendEmail", summary, payload: { to: "jordan" } }, ctx());
  const logFor = (entityId: string) =>
    db.select().from(t.activityLog).where(eq(t.activityLog.entityId, entityId));

  it("approves: sets status and decided time, and logs it", async () => {
    const a = await request("Email Jordan");
    const before = Date.now();
    const d = await A.decideApproval.run({ approvalId: a.id, decision: "approve" }, ctx());
    expect(d.status).toBe("approved");
    expect(d.decidedAt!.getTime()).toBeGreaterThanOrEqual(before);
    const log = await logFor(a.id);
    expect(log.map((l) => [l.action, l.summary])).toEqual([
      ["requestApproval", "Requested approval: Email Jordan"],
      ["decideApproval", "Approved: Email Jordan"]
    ]);
    expect(log[1].data).toBeNull();
  });

  it("rejects with a note and keeps the note in the log", async () => {
    const a = await request("Email Kwaku");
    const d = await A.decideApproval.run(
      { approvalId: a.id, decision: "reject", note: "  Not yet  " },
      ctx()
    );
    expect(d.status).toBe("rejected");
    expect(d.decidedAt).toBeInstanceOf(Date);
    const [, entry] = await logFor(a.id);
    expect(entry.summary).toBe("Rejected: Email Kwaku");
    expect(entry.data).toEqual({ note: "Not yet" });
  });

  it("refuses a second decision and logs nothing more", async () => {
    const a = await request("Email Ama");
    await A.decideApproval.run({ approvalId: a.id, decision: "reject" }, ctx());
    const err = await A.decideApproval
      .run({ approvalId: a.id, decision: "approve" }, ctx())
      .catch((e) => e);
    expect(err).toBeInstanceOf(ActionError);
    expect(err.code).toBe("conflict");
    expect(err.message).toBe("This approval was already rejected");
    const [row] = await db.select().from(t.approvals).where(eq(t.approvals.id, a.id));
    expect(row.status).toBe("rejected");
    expect(await logFor(a.id)).toHaveLength(2);
  });

  it("returns not_found for a missing approval", async () => {
    await expect(
      A.decideApproval.run({ approvalId: "missing", decision: "approve" }, ctx())
    ).rejects.toThrow("Approval not found");
  });

  it("drops decided items from the open list", async () => {
    const open = await request("Still open");
    const r = await A.listApprovals.run({ status: "pending" }, ctx());
    expect(r.approvals.map((a) => a.id)).toContain(open.id);
    expect(r.approvals.every((a) => a.status === "pending")).toBe(true);
    expect(r.approvals.map((a) => a.summary)).not.toContain("Email Jordan");
    const approved = await A.listApprovals.run({ status: "approved" }, ctx());
    expect(approved.approvals.map((a) => a.summary)).toEqual(["Email Jordan"]);
  });
});
