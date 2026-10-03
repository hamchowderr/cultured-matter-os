import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as A from "@/actions";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import {
  activityHref,
  dayHeading,
  endOfIsoDay,
  groupByDay,
  isIsoDay,
  startOfIsoDay
} from "@/lib/activity";
import { freshDb } from "./test-db";

let db: Database;
let cleanup: () => void;
const ctx = () => ({ db });
beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
});
afterAll(() => cleanup());

const TZ = "America/Los_Angeles";
// 9am Pacific (PDT, UTC-7) on a given October day.
const pacific9am = (day: number) => new Date(Date.UTC(2026, 9, day, 16));

describe("listActivity", () => {
  beforeAll(async () => {
    await db.insert(t.activityLog).values([
      {
        at: pacific9am(1),
        action: "starCompany",
        entityType: "company",
        summary: "Starred Mycelium Co"
      },
      {
        at: pacific9am(2),
        action: "setGrantStatus",
        entityType: "grant",
        summary: "Moved SBIR Phase I to applying"
      },
      {
        at: pacific9am(3),
        action: "passCompany",
        entityType: "company",
        summary: "Passed on Algae Labs"
      },
      {
        // 11:30pm Pacific on Oct 3 is already Oct 4 in UTC.
        at: new Date(Date.UTC(2026, 9, 4, 6, 30)),
        action: "createTask",
        entityType: "task",
        summary: 'Created task "Email Mycelium founders"'
      }
    ]);
  });

  it("returns every row newest first with the total", async () => {
    const { entries, total } = await A.listActivity.run({}, ctx());
    expect(total).toBe(4);
    expect(entries.map((e) => e.action)).toEqual([
      "createTask",
      "passCompany",
      "setGrantStatus",
      "starCompany"
    ]);
    expect(entries[0].at).toBeInstanceOf(Date);
  });

  it("filters by entity type", async () => {
    const { entries, total } = await A.listActivity.run({ entityType: "company" }, ctx());
    expect(total).toBe(2);
    expect(entries.map((e) => e.summary)).toEqual(["Passed on Algae Labs", "Starred Mycelium Co"]);
  });

  it("filters by date range, from inclusive and to exclusive", async () => {
    const { entries } = await A.listActivity.run({ from: pacific9am(2), to: pacific9am(3) }, ctx());
    expect(entries.map((e) => e.action)).toEqual(["setGrantStatus"]);
  });

  it("takes whole days in Simone's time zone", async () => {
    // Oct 3 Pacific includes the 11:30pm task even though it is Oct 4 in UTC.
    const { entries } = await A.listActivity.run(
      { from: startOfIsoDay("2026-10-03", TZ), to: endOfIsoDay("2026-10-03", TZ) },
      ctx()
    );
    expect(entries.map((e) => e.action)).toEqual(["createTask", "passCompany"]);
  });

  it("searches the summary text, case-insensitively", async () => {
    const { entries, total } = await A.listActivity.run({ query: "mycelium" }, ctx());
    expect(total).toBe(2);
    expect(entries.map((e) => e.action)).toEqual(["createTask", "starCompany"]);

    const none = await A.listActivity.run({ query: "nothing like this" }, ctx());
    expect(none).toEqual({ entries: [], total: 0 });
  });

  it("combines filters", async () => {
    const { entries } = await A.listActivity.run(
      { entityType: "company", query: "mycelium" },
      ctx()
    );
    expect(entries.map((e) => e.action)).toEqual(["starCompany"]);
  });

  it("pages with limit and offset, total stays the full count", async () => {
    const first = await A.listActivity.run({ limit: 3, offset: 0 }, ctx());
    const second = await A.listActivity.run({ limit: 3, offset: 3 }, ctx());
    expect(first.total).toBe(4);
    expect(second.total).toBe(4);
    expect(first.entries).toHaveLength(3);
    expect(second.entries.map((e) => e.action)).toEqual(["starCompany"]);
  });

  it("rejects a bad page size", async () => {
    await expect(A.listActivity.run({ limit: 0 }, ctx())).rejects.toThrow();
  });
});

describe("activity links", () => {
  it("resolves the entity of real logged actions and links where a page shows it", async () => {
    const project = await A.createProject.run({ name: "Beauty series" }, ctx());
    const task = await A.createTask.run({ title: "Draft pitch", projectId: project.id }, ctx());
    await A.updateProject.run({ projectId: project.id, status: "done" }, ctx());

    const [company] = await db
      .insert(t.companies)
      .values({ name: "Fungi & Co", normalizedName: "fungi co", firstSeenAt: new Date() })
      .returning();
    await A.shortlistCompany.run({ companyId: company.id }, ctx());

    const find = async (query: string) => (await A.listActivity.run({ query }, ctx())).entries[0];
    const created = await find("Draft pitch");
    const marked = await find("Marked project Beauty series done");
    const shortlisted = await find("Fungi & Co");

    expect(created.action).toBe("createTask");
    expect(created.entity).toMatchObject({
      name: "Draft pitch",
      projectId: project.id,
      projectDone: true
    });
    expect(activityHref(created)).toBe(`/projects?p=${project.id}&done=1`);
    expect(activityHref(marked)).toBe(`/projects?p=${project.id}&done=1`);
    expect(shortlisted.action).toBe("shortlistCompany");
    expect(activityHref(shortlisted)).toBe("/radar?view=all&q=Fungi+%26+Co");
    expect(task.id).toBeTruthy();
  });

  it("does not link entities without a page or that no longer exist", () => {
    const base = { entityId: "x", entity: null };
    expect(activityHref({ ...base, entityType: "approval" })).toBeNull();
    expect(activityHref({ ...base, entityType: "company" })).toBeNull();
    expect(activityHref({ entityType: "contact", entityId: null, entity: null })).toBe("/people");
    expect(
      activityHref({
        entityType: "grant",
        entityId: "g",
        entity: { name: "SBIR", projectId: null, projectDone: false, filed: false }
      })
    ).toBe("/grants?q=SBIR&all=1");
  });
});

describe("archive days", () => {
  it("validates YYYY-MM-DD", () => {
    expect(isIsoDay("2026-10-03")).toBe(true);
    expect(isIsoDay("2026-13-40")).toBe(false);
    expect(isIsoDay("yesterday")).toBe(false);
    expect(isIsoDay(undefined)).toBe(false);
  });

  it("groups rows by Pacific day and names today and yesterday", () => {
    const rows = [
      { at: new Date(Date.UTC(2026, 9, 4, 6, 30)) },
      { at: pacific9am(3) },
      { at: pacific9am(2) }
    ];
    const groups = groupByDay(rows, TZ);
    expect(groups.map((g) => [g.day, g.rows.length])).toEqual([
      ["2026-10-03", 2],
      ["2026-10-02", 1]
    ]);

    const now = new Date(Date.UTC(2026, 9, 4, 3)); // 8pm Oct 3 Pacific
    expect(dayHeading("2026-10-03", now, TZ)).toBe("Today");
    expect(dayHeading("2026-10-02", now, TZ)).toBe("Yesterday");
    expect(dayHeading("2026-09-28", now, TZ)).toBe("Monday, September 28");
    expect(dayHeading("2025-09-28", now, TZ)).toBe("Sunday, September 28, 2025");
  });
});
