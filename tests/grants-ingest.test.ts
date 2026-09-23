import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/db";
import * as t from "@/db/schema";
import { caGrants } from "@/ingest/grants/ca-grants";
import { runGrantIngestion } from "@/ingest/grants/run";
import { amountRange, type GrantRecord, type GrantSource } from "@/ingest/grants/types";
import { freshDb } from "./test-db";

let db: Database;
let cleanup: () => void;
beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
});
afterAll(() => cleanup());

const day = 86_400_000;
const now = new Date("2026-09-22T15:00:00Z");

const grant = (r: Partial<GrantRecord> & { externalId: string; title: string }): GrantRecord => ({
  agency: null,
  amountMin: null,
  amountMax: null,
  deadline: null,
  forProfitEligible: true,
  url: null,
  description: null,
  raw: {},
  ...r
});

const source = (slug: string, records: GrantRecord[] | Error): GrantSource => ({
  slug,
  name: slug,
  kind: "grants_gov",
  url: `https://example.com/${slug}`,
  fetchRecords: async () => {
    if (records instanceof Error) throw records;
    return records;
  }
});

describe("amountRange", () => {
  it("reads ranges, single caps and units", () => {
    expect(amountRange("Between $30,000 and $300,000")).toEqual({ min: 30_000, max: 300_000 });
    expect(amountRange("Up to $1.5 million")).toEqual({ min: null, max: 1_500_000 });
    expect(amountRange("Dependent on submissions")).toEqual({ min: null, max: null });
  });
});

describe("California Grants Portal reader", () => {
  it("keeps business-eligible grants in relevant categories", async () => {
    const records = [
      {
        PortalID: 1,
        Status: "active",
        Title: "Clean Materials Fund",
        Categories: "Environment & Water; Education",
        EstAmounts: "Up to $250,000",
        ApplicationDeadline: "2026-11-04 23:59:00",
        AgencyDept: "CalRecycle",
        ApplicantType: "Business; Nonprofit",
        GrantURL: "https://calrecycle.ca.gov/x"
      },
      {
        PortalID: 2,
        Status: "active",
        Title: "Nurse Training",
        Categories: "Health & Human Services",
        EstAmounts: null,
        ApplicationDeadline: "Ongoing",
        AgencyDept: "HCAI",
        ApplicantType: "Business",
        GrantURL: null
      }
    ];
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({ success: true, result: { records } })
      )) as unknown as typeof fetch;
    const out = await caGrants.fetchRecords(fakeFetch);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      title: "Clean Materials Fund",
      agency: "CalRecycle",
      amountMax: 250_000,
      forProfitEligible: true
    });
    expect(out[0].deadline?.toISOString()).toBe("2026-11-04T12:00:00.000Z");
  });
});

describe("runGrantIngestion", () => {
  const a = source("a", [
    grant({ externalId: "1", title: "EPA SBIR", deadline: new Date(now.getTime() + 20 * day) }),
    grant({ externalId: "2", title: "Rolling fund" }),
    grant({
      externalId: "3",
      title: "Closed last week",
      deadline: new Date(now.getTime() - 7 * day)
    }),
    grant({
      externalId: "1",
      title: "EPA SBIR (duplicate row)",
      deadline: new Date(now.getTime() + 20 * day)
    })
  ]);

  it("stores open grants once, skips closed ones, and survives a failing source", async () => {
    const results = await runGrantIngestion({
      db,
      grantSources: [a, source("down", new Error("403 Forbidden"))],
      now
    });
    expect(results.map((r) => [r.slug, r.ok])).toEqual([
      ["a", true],
      ["down", false]
    ]);
    const rows = await db.select().from(t.grants);
    expect(rows.map((r) => r.title).sort()).toEqual(["EPA SBIR (duplicate row)", "Rolling fund"]);
    const [down] = await db.select().from(t.sources).where(eq(t.sources.slug, "down"));
    expect(down.lastStatus).toBe("failed");
  });

  it("re-runs without duplicates and keeps her board status", async () => {
    const [sbir] = await db.select().from(t.grants).where(eq(t.grants.externalId, "1"));
    await db.update(t.grants).set({ status: "applying" }).where(eq(t.grants.id, sbir.id));

    const again = await runGrantIngestion({
      db,
      grantSources: [a],
      now: new Date(now.getTime() + day)
    });
    expect(again[0]).toMatchObject({ ok: true, created: 0 });
    const rows = await db.select().from(t.grants);
    expect(rows).toHaveLength(2);
    const [after] = await db.select().from(t.grants).where(eq(t.grants.id, sbir.id));
    expect(after.status).toBe("applying");
    expect(after.firstSeenAt).toEqual(now);
  });
});
