import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as A from "@/actions";
import { ActionError } from "@/actions";
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

const logFor = (entityId: string) =>
  db.select().from(t.activityLog).where(eq(t.activityLog.entityId, entityId));

async function seedCompany(values: Partial<typeof t.companies.$inferInsert> & { name: string }) {
  const [row] = await db
    .insert(t.companies)
    .values({ normalizedName: values.name.toLowerCase(), firstSeenAt: new Date(), ...values })
    .returning();
  return row;
}

describe("registry", () => {
  it("exposes the PRD actions plus the Radar helpers", () => {
    expect(A.allActions.map((a) => a.name).sort()).toEqual(
      [
        "searchCompanies",
        "getCompany",
        "radarFacets",
        "radarFindsByWeek",
        "starCompany",
        "resetCompany",
        "shortlistCompany",
        "passCompany",
        "searchGrants",
        "setGrantStatus",
        "listActivity",
        "searchContacts",
        "findWarmPath",
        "countWarmPaths",
        "listPairings",
        "addPairing",
        "removePairing",
        "linkContact",
        "unlinkContact",
        "importContacts",
        "setContactSectors",
        "createCapture",
        "listCaptures",
        "classifyCapture",
        "createTask",
        "setTaskStatus",
        "listProjects",
        "listTasks",
        "getProject",
        "createProject",
        "updateProject",
        "updateTask",
        "linkTaskToProject",
        "unlinkTaskFromProject",
        "requestApproval",
        "listApprovals",
        "decideApproval",
        "dueTasks",
        "setNewsletter",
        "newsletterStatus",
        "outlookStatus",
        "setupStatus",
        "syncOutlook",
        "listContactEmails",
        "draftFollowUp",
        "checkOutlookReplies"
      ].sort()
    );
    for (const a of A.allActions) {
      expect(a.description.length).toBeGreaterThan(10);
      expect(a.input).toBeDefined();
      expect(a.output).toBeDefined();
    }
  });

  it("keeps UI code away from the database", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name)) {
          const src = readFileSync(path, "utf8");
          if (/from ["'](@\/db|drizzle-orm|@libsql\/client)/.test(src)) offenders.push(path);
          if (/from ["']@\/actions["']/.test(src)) offenders.push(`${path} (use @/actions/server)`);
        }
      }
    };
    walk("app");
    walk("components");
    expect(offenders).toEqual([]);
  });
});

describe("radar", () => {
  it("shortlists and passes with a note, and logs each", async () => {
    const c = await seedCompany({ name: "Soliome", domain: "soliome.com" });
    const s = await A.shortlistCompany.run({ companyId: c.id, note: "reef-safe" }, ctx());
    expect(s.status).toBe("shortlisted");
    expect(s.statusNote).toBe("reef-safe");
    const p = await A.passCompany.run({ companyId: c.id }, ctx());
    expect(p.status).toBe("passed");
    const log = await logFor(c.id);
    expect(log.map((l) => l.action)).toEqual(["shortlistCompany", "passCompany"]);
  });

  it("throws not_found for a missing company and logs nothing", async () => {
    const before = (await db.select().from(t.activityLog)).length;
    await expect(A.shortlistCompany.run({ companyId: "nope" }, ctx())).rejects.toBeInstanceOf(
      ActionError
    );
    expect((await db.select().from(t.activityLog)).length).toBe(before);
  });

  it("filters by category and by source", async () => {
    const [src] = await db
      .insert(t.sources)
      .values({ slug: "sosv", name: "SOSV", kind: "wp_json", url: "https://sosv.com" })
      .returning();
    const beauty = await seedCompany({ name: "Glowcell", categories: ["Beauty", "Biotech"] });
    await seedCompany({ name: "Steelco", categories: ["Industry"] });
    await db.insert(t.sightings).values({
      companyId: beauty.id,
      sourceId: src.id,
      externalId: "1",
      seenAt: new Date(),
      raw: {}
    });

    const byCat = await A.searchCompanies.run({ categories: ["Beauty"] }, ctx());
    expect(byCat.companies.map((c) => c.name)).toEqual(["Glowcell"]);
    expect(byCat.total).toBe(1);

    const bySource = await A.searchCompanies.run({ sourceSlug: "sosv" }, ctx());
    expect(bySource.companies.map((c) => c.name)).toEqual(["Glowcell"]);

    await seedCompany({ name: "Glowtwo", categories: ["Beauty"] });
    const facets = await A.radarFacets.run({}, ctx());
    expect(facets.categories[0]).toEqual({ name: "Beauty", count: 2 });
    expect(facets.categories).toContainEqual({ name: "Industry", count: 1 });
  });

  it("counts first finds per week, oldest first", async () => {
    // A fixed "now" far from the other tests' companies keeps the windows to this test's rows.
    const now = new Date("2030-01-29T12:00:00Z");
    const day = 86_400_000;
    const ago = (days: number) => new Date(now.getTime() - days * day);
    await seedCompany({ name: "Weekly A", firstSeenAt: ago(1) });
    await seedCompany({ name: "Weekly B", firstSeenAt: ago(2) });
    await seedCompany({ name: "Weekly C", firstSeenAt: ago(9) });
    await seedCompany({ name: "Weekly D", firstSeenAt: ago(40) });

    const { weeks } = await A.radarFindsByWeek.run({ weeks: 4, now }, ctx());
    expect(weeks.map((w) => w.count)).toEqual([0, 0, 1, 2]);
    expect(weeks[3].start.getTime()).toBe(now.getTime() - 7 * day);
  });

  it("rejects bad input", async () => {
    await expect(A.searchCompanies.run({ limit: 0 } as never, ctx())).rejects.toThrow();
  });
});

describe("grants", () => {
  it("sorts by deadline with rolling grants last, and filters the window", async () => {
    const [src] = await db
      .insert(t.sources)
      .values({
        slug: "grants-gov",
        name: "Grants.gov",
        kind: "grants_gov",
        url: "https://api.grants.gov"
      })
      .returning();
    const day = 86_400_000;
    const base = { sourceId: src.id, raw: {}, firstSeenAt: new Date(), forProfitEligible: true };
    await db.insert(t.grants).values([
      { ...base, externalId: "a", title: "Rolling fund", deadline: null },
      { ...base, externalId: "b", title: "Late", deadline: new Date(Date.now() + 60 * day) },
      { ...base, externalId: "c", title: "Soon", deadline: new Date(Date.now() + 10 * day) },
      {
        ...base,
        externalId: "d",
        title: "Nonprofit only",
        forProfitEligible: false,
        deadline: null
      }
    ]);

    const all = await A.searchGrants.run({ forProfitOnly: true }, ctx());
    expect(all.grants.map((g) => g.title)).toEqual(["Soon", "Late", "Rolling fund"]);
    expect(all.grants[0]).not.toHaveProperty("raw");

    const soon = await A.searchGrants.run({ closingWithinDays: 30 }, ctx());
    expect(soon.grants.map((g) => g.title)).toEqual(["Soon"]);

    const moved = await A.setGrantStatus.run(
      { grantId: all.grants[0].id, status: "applying" },
      ctx()
    );
    expect(moved.status).toBe("applying");
    expect((await logFor(moved.id))[0].summary).toBe("Moved Soon to applying");
  });
});

describe("people", () => {
  it("finds warm paths by domain, by name, via a brand, and by hand", async () => {
    const co = await seedCompany({
      name: "Algaeworks",
      domain: "algaeworks.io",
      normalizedName: "algaeworks"
    });
    const [brand] = await db
      .insert(t.pairings)
      .values({ companyId: co.id, brandName: "Glossier", brandDomain: "https://www.glossier.com" })
      .returning();
    const [byDomain, byName, atBrand, linked, stranger] = await db
      .insert(t.contacts)
      .values([
        { fullName: "Ada Domain", companyDomain: "algaeworks.io", source: "sample" },
        { fullName: "Ben Name", company: "AlgaeWorks, Inc.", source: "sample" },
        { fullName: "Cy Brand", companyDomain: "glossier.com", source: "sample" },
        { fullName: "Di Linked", company: "Elsewhere", source: "sample" },
        { fullName: "Ed Stranger", company: "Algae Farms", source: "sample" }
      ])
      .returning();
    await db.insert(t.contactLinks).values({
      contactId: linked.id,
      companyId: co.id,
      relation: "knows",
      note: "met at IndieBio"
    });

    const { paths } = await A.findWarmPath.run({ companyId: co.id }, ctx());
    const got = paths.map((p) => `${p.contact.fullName}|${p.via}|${p.reason}`).sort();
    expect(got).toEqual(
      [
        "Ada Domain|company|works_at",
        "Ben Name|company|works_at",
        "Cy Brand|brand|works_at",
        "Di Linked|company|linked"
      ].sort()
    );
    expect(paths.find((p) => p.contact.id === linked.id)?.note).toBe("met at IndieBio");
    expect(paths.some((p) => p.contact.id === stranger.id)).toBe(false);
    expect(byDomain && byName && atBrand && brand).toBeTruthy();
  });

  it("searches contacts by text and sector", async () => {
    await db.insert(t.contacts).values({
      fullName: "Fay Sector",
      company: "Loom",
      sectors: ["fashion"],
      source: "sample"
    });
    const r = await A.searchContacts.run({ sector: "fashion" }, ctx());
    expect(r.contacts.map((c) => c.fullName)).toEqual(["Fay Sector"]);
    const q = await A.searchContacts.run({ query: "Loom" }, ctx());
    expect(q.contacts.map((c) => c.fullName)).toEqual(["Fay Sector"]);
  });

  it("sorts contacts by name, company or role, blanks last", async () => {
    await db.insert(t.contacts).values([
      {
        fullName: "Sol A",
        company: "Zeta",
        position: "CEO",
        sectors: ["sortme"],
        source: "manual"
      },
      {
        fullName: "Sol B",
        company: "Alpha",
        position: null,
        sectors: ["sortme"],
        source: "manual"
      },
      { fullName: "Sol C", company: null, position: "Buyer", sectors: ["sortme"], source: "manual" }
    ]);
    const names = async (input: Parameters<typeof A.searchContacts.run>[0]) =>
      (await A.searchContacts.run({ sector: "sortme", ...input }, ctx())).contacts.map(
        (c) => c.fullName
      );
    // Default stays alphabetical by name, as before.
    expect(await names({})).toEqual(["Sol A", "Sol B", "Sol C"]);
    expect(await names({ dir: "desc" })).toEqual(["Sol C", "Sol B", "Sol A"]);
    expect(await names({ sort: "company" })).toEqual(["Sol B", "Sol A", "Sol C"]);
    expect(await names({ sort: "company", dir: "desc" })).toEqual(["Sol A", "Sol B", "Sol C"]);
    expect(await names({ sort: "role" })).toEqual(["Sol C", "Sol A", "Sol B"]);
    // Paging follows the sort.
    expect(await names({ sort: "company", limit: 1, offset: 1 })).toEqual(["Sol A"]);
  });
});

describe("work", () => {
  it("captures, then files a task into a project", async () => {
    const [project] = await db.insert(t.projects).values({ name: "Beauty series" }).returning();
    const capture = await A.createCapture.run({ body: "Ask Kwaku for an intro to Soliome" }, ctx());
    const filed = await A.classifyCapture.run(
      { captureId: capture.id, kind: "task", tier: 1, projectId: project.id },
      ctx()
    );
    expect(filed.capture.filedAt).toBeInstanceOf(Date);
    expect(filed.task?.projectId).toBe(project.id);
    expect(filed.task?.captureId).toBe(capture.id);
    expect((await logFor(capture.id)).map((l) => l.action)).toEqual([
      "createCapture",
      "classifyCapture"
    ]);
  });

  it("files an idea without creating a task", async () => {
    const capture = await A.createCapture.run({ body: "Mycelium packaging episode" }, ctx());
    const filed = await A.classifyCapture.run(
      { captureId: capture.id, kind: "idea", tier: 2 },
      ctx()
    );
    expect(filed.task).toBeNull();
  });

  it("creates subtasks and tracks completion", async () => {
    const parent = await A.createTask.run({ title: "Prep pitch" }, ctx());
    const child = await A.createTask.run({ title: "Draft deck", parentTaskId: parent.id }, ctx());
    expect(child.parentTaskId).toBe(parent.id);
    const waiting = await A.setTaskStatus.run({ taskId: child.id, status: "waiting" }, ctx());
    expect(waiting.completedAt).toBeNull();
    const done = await A.setTaskStatus.run({ taskId: child.id, status: "done" }, ctx());
    expect(done.completedAt).toBeInstanceOf(Date);
    await expect(A.createTask.run({ title: "x", projectId: "missing" }, ctx())).rejects.toThrow(
      "Project not found"
    );
  });

  it("queues an approval", async () => {
    const a = await A.requestApproval.run(
      { action: "sendEmail", summary: "Email Kwaku", payload: { to: "kwaku" } },
      ctx()
    );
    expect(a.status).toBe("pending");
    expect((await logFor(a.id))[0].action).toBe("requestApproval");
  });
});
