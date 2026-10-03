import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as A from "@/actions";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import { freshDb } from "./test-db";

let db: Database;
let cleanup: () => void;
const ctx = () => ({ db });
beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
});
afterAll(() => cleanup());

const DAY = 86_400_000;
const now = new Date(2026, 9, 3, 12, 0);
const ago = (days: number) => new Date(now.getTime() - days * DAY);
const ahead = (days: number) => new Date(now.getTime() + days * DAY);
const USER = "user-1";

const list = (extra: { radarSince?: Date; userId?: string } = {}) =>
  A.listNotifications.run({ userId: USER, now, ...extra }, ctx());
const ofKind = async (kind: string, extra?: { radarSince?: Date; userId?: string }) =>
  (await list(extra)).items.filter((i) => i.kind === kind);

describe("listNotifications", () => {
  it("is empty when nothing needs her", async () => {
    expect(await list()).toEqual({ items: [], unread: 0 });
  });

  it("lists open approvals, not decided ones, linking to Today", async () => {
    await db.insert(t.approvals).values([
      { action: "x", payload: {}, summary: "Send follow-up to Ana", createdAt: ago(1) },
      { action: "x", payload: {}, summary: "Already done", status: "approved", createdAt: ago(1) }
    ]);
    const items = await ofKind("approval");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: "Waiting for your approval",
      description: "Send follow-up to Ana",
      href: "/today#approvals",
      read: false
    });
  });

  it("lists Gmail replies from the last 14 days, linking to the task's project", async () => {
    const p = await A.createProject.run({ name: "Docuseries" }, ctx());
    await db.insert(t.tasks).values([
      {
        title: "Fresh reply",
        status: "replied",
        emailThreadId: "th1",
        projectId: p.id,
        updatedAt: ago(2)
      },
      { title: "Old reply", status: "replied", emailThreadId: "th2", updatedAt: ago(20) },
      { title: "Set by hand", status: "replied", updatedAt: ago(1) },
      { title: "Still waiting", status: "waiting", emailThreadId: "th3", updatedAt: ago(1) }
    ]);
    const items = await ofKind("reply");
    expect(items.map((i) => i.description)).toEqual(["Fresh reply"]);
    expect(items[0].href).toBe(`/projects?p=${p.id}`);
  });

  it("lists grants closing within 7 days that are open and not passed", async () => {
    const [src] = await db
      .insert(t.sources)
      .values({ slug: "g", name: "Grants", kind: "grants_gov", url: "https://example.com" })
      .returning();
    const grant = (
      title: string,
      deadline: Date,
      extra: Partial<typeof t.grants.$inferInsert> = {}
    ) => ({
      sourceId: src.id,
      externalId: title,
      title,
      deadline,
      forProfitEligible: true,
      raw: {},
      firstSeenAt: ago(30),
      ...extra
    });
    await db
      .insert(t.grants)
      .values([
        grant("Soon", ahead(3)),
        grant("On her board", ahead(5), { forProfitEligible: false, status: "applying" }),
        grant("Passed on", ahead(2), { status: "passed" }),
        grant("Already closed", ago(1)),
        grant("Next month", ahead(30)),
        grant("Not eligible", ahead(4), { forProfitEligible: false })
      ]);
    const items = await ofKind("grant");
    expect(items.map((i) => i.description).sort()).toEqual(["On her board", "Soon"]);
    expect(items.every((i) => i.href === "/grants")).toBe(true);
  });

  it("summarises new radar finds since the last visit as one item", async () => {
    const co = (name: string, firstSeenAt: Date, status: "new" | "passed" = "new") => ({
      name,
      normalizedName: name.toLowerCase(),
      firstSeenAt,
      status
    });
    await db
      .insert(t.companies)
      .values([co("A", ago(1)), co("B", ago(2)), co("C", ago(10)), co("D", ago(1), "passed")]);

    const items = await ofKind("radar", { radarSince: ago(5) });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      description: "2 new companies since your last visit",
      href: "/radar?new=1"
    });
    // Before a first visit, the last week counts.
    expect((await ofKind("radar"))[0].description).toBe("2 new companies since your last visit");
    expect(await ofKind("radar", { radarSince: ago(0.5) })).toHaveLength(0);
  });

  it("summarises inbox captures still to sort as one item", async () => {
    await db.insert(t.captures).values([
      { body: "idea one", createdAt: ago(1) },
      { body: "idea two", createdAt: ago(3) },
      { body: "filed", filedAt: ago(1), createdAt: ago(4) }
    ]);
    const items = await ofKind("inbox");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ description: "2 captures still to sort", href: "/inbox" });
  });

  it("orders items newest first and counts unread", async () => {
    const r = await list({ radarSince: ago(5) });
    const times = r.items.map((i) => i.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(r.unread).toBe(r.items.length);
  });
});

describe("markNotificationsRead", () => {
  it("marks items read for that user only and logs the write", async () => {
    const before = await list({ radarSince: ago(5) });
    const approval = before.items.find((i) => i.kind === "approval")!;
    await A.markNotificationsRead.run({ userId: USER, itemIds: [approval.id] }, ctx());

    const after = await list({ radarSince: ago(5) });
    expect(after.items.find((i) => i.id === approval.id)!.read).toBe(true);
    expect(after.unread).toBe(before.unread - 1);

    const other = await list({ radarSince: ago(5), userId: "someone-else" });
    expect(other.unread).toBe(other.items.length);

    const log = await db
      .select()
      .from(t.activityLog)
      .where(eq(t.activityLog.action, "markNotificationsRead"));
    expect(log[0].summary).toBe("Marked 1 notification as read");
  });

  it("marks all as read, and is safe to repeat", async () => {
    const ids = (await list({ radarSince: ago(5) })).items.map((i) => i.id);
    await A.markNotificationsRead.run({ userId: USER, itemIds: ids }, ctx());
    await A.markNotificationsRead.run({ userId: USER, itemIds: ids }, ctx());
    expect((await list({ radarSince: ago(5) })).unread).toBe(0);
  });

  it("shows a summarised item again when something new arrives", async () => {
    await db.insert(t.captures).values({ body: "another", createdAt: ago(0.1) });
    const inbox = await ofKind("inbox");
    expect(inbox[0]).toMatchObject({ description: "3 captures still to sort", read: false });
  });
});
