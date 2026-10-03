import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { radarFindsByWeek } from "@/actions/radar";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import { parseDeals } from "@/ingest/radar/ctvc";
import { runRadarIngestion } from "@/ingest/radar/run";
import { sosv } from "@/ingest/radar/sosv";
import type { RadarRecord, RadarSource } from "@/ingest/radar/types";
import { categorize } from "@/lib/categories";
import { freshDb } from "./test-db";

let db: Database;
let cleanup: () => void;
beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
});
afterAll(() => cleanup());

const rec = (r: Partial<RadarRecord> & { externalId: string; name: string }): RadarRecord => ({
  tags: [],
  raw: {},
  ...r
});

const fakeSource = (slug: string, records: RadarRecord[] | Error): RadarSource => ({
  slug,
  name: slug.toUpperCase(),
  kind: "wp_json",
  url: `https://example.com/${slug}`,
  fetchRecords: async () => {
    if (records instanceof Error) throw records;
    return records;
  }
});

describe("categorize", () => {
  it("maps source tags to Simone's categories", () => {
    expect(categorize("Reef-safe sunscreen", "Beauty")).toEqual(
      expect.arrayContaining(["Beauty/Chemistry", "Oceans"])
    );
    expect(categorize("Mycelium leather alternative for fashion brands")).toEqual(
      expect.arrayContaining(["Materials", "Fashion/Textiles"])
    );
    expect(categorize("Accounting software for dentists")).toEqual([]);
  });
});

describe("CTVC deals parser", () => {
  const html = `<h2><strong>Deals of the Week (9/14 - 9/20)</strong></h2>
    <h3 id="vc-growth"><strong>VC / Growth</strong></h3>
    <p>&#x26a1; <strong>Mazama</strong>, a Frisco, TX-based superhot rock geothermal developer, <a href="x"><u>raised</u></a> <strong>&#x24;135m</strong> in Series B funding from Someone.</p>
    <p>&#x267b;&#xfe0f; <strong>Loop &amp; Co</strong>, a Boston, MA-based textile recycling startup, <a href="y"><u>raised</u></a> <strong>&#x24;4m</strong> in seed funding.</p>
    <h3 id="exits"><strong>Exits</strong></h3>
    <p><strong>Acquired Corp</strong>, a Paris-based company, was acquired.</p>`;

  it("reads name, description, stage and amount from VC / Growth only", () => {
    const deals = parseDeals(html, { link: "https://ctvc.co/314", date: null });
    expect(deals.map((d) => d.name)).toEqual(["Mazama", "Loop & Co"]);
    expect(deals[0]).toMatchObject({
      description: "superhot rock geothermal developer",
      stage: "Series B",
      externalId: "mazama"
    });
    expect(deals[1].stage).toBe("Seed");
    expect((deals[0].raw as { amount: string }).amount).toBe("$135m");
  });
});

describe("SOSV reader", () => {
  it("pages the collection and resolves taxonomy names", async () => {
    const json = (data: unknown, pages = 1) =>
      new Response(JSON.stringify(data), { headers: { "x-wp-totalpages": String(pages) } });
    const fakeFetch = (async (url: string) => {
      if (url.includes("/company?")) {
        const page = Number(new URL(url).searchParams.get("page"));
        return json(
          [
            {
              id: page,
              title: { rendered: page === 1 ? "Algae &amp; Co" : "Second" },
              link: "https://sosv.com/company/x",
              tx_category: [10],
              tx_stage: [20],
              tx_cohort: [30],
              acf: { tagline: "Seaweed packaging", website: "https://algae.co" }
            }
          ],
          2
        );
      }
      const terms: Record<string, { id: number; name: string }[]> = {
        tx_category: [{ id: 10, name: "Biomaterials" }],
        tx_stage: [{ id: 20, name: "Pre-Seed" }],
        tx_cohort: [{ id: 30, name: "IndieBio SF 2025" }]
      };
      const tax = Object.keys(terms).find((k) => url.includes(`/${k}?`));
      return json(tax ? terms[tax] : []);
    }) as typeof fetch;

    const records = await sosv.fetchRecords(fakeFetch);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      name: "Algae & Co",
      stage: "Pre-Seed",
      cohortYear: 2025,
      website: "https://algae.co",
      tags: ["Biomaterials"]
    });
  });
});

describe("runRadarIngestion", () => {
  const day1 = new Date("2026-09-20T12:00:00Z");
  const day2 = new Date("2026-09-21T12:00:00Z");

  const a = fakeSource("a", [
    rec({ externalId: "1", name: "Soliome", website: "https://soliome.com", tags: ["Beauty"] }),
    rec({ externalId: "2", name: "No Site Labs", description: "Seaweed packaging" })
  ]);
  const b = fakeSource("b", [
    rec({
      externalId: "x",
      name: "Soliome Inc.",
      website: "www.soliome.com/about",
      stage: "Pre-seed"
    }),
    rec({ externalId: "y", name: "No Site Labs, LLC" }),
    rec({ externalId: "z", name: "Other Co", emailDomain: "soliome.com" })
  ]);
  const broken = fakeSource("broken", new Error("503 Service Unavailable"));

  it("dedupes by domain then name, and keeps going past a failed source", async () => {
    const results = await runRadarIngestion({ db, radarSources: [a, broken, b], now: day1 });
    expect(results.map((r) => [r.slug, r.ok])).toEqual([
      ["a", true],
      ["broken", false],
      ["b", true]
    ]);

    const rows = await db.select().from(t.companies);
    expect(rows.map((r) => r.name).sort()).toEqual(["No Site Labs", "Other Co", "Soliome"]);

    const soliome = rows.find((r) => r.name === "Soliome")!;
    expect(soliome.domain).toBe("soliome.com");
    expect(soliome.stage).toBe("Pre-seed");
    expect(soliome.categories).toContain("Beauty/Chemistry");
    expect(soliome.firstSeenAt).toEqual(day1);
    const soliomeSightings = await db
      .select()
      .from(t.sightings)
      .where(eq(t.sightings.companyId, soliome.id));
    expect(soliomeSightings).toHaveLength(2);

    // An email domain never merges two different companies.
    expect(rows.find((r) => r.name === "Other Co")!.domain).toBeNull();

    const [brokenRow] = await db.select().from(t.sources).where(eq(t.sources.slug, "broken"));
    expect(brokenRow.lastStatus).toBe("failed");
    expect(brokenRow.lastError).toContain("503");
    const logs = await db
      .select()
      .from(t.activityLog)
      .where(eq(t.activityLog.action, "ingestRadar"));
    expect(logs.map((l) => l.summary)).toEqual(
      expect.arrayContaining([expect.stringContaining("BROKEN failed: 503")])
    );
  });

  it("is idempotent: a second run adds nothing and keeps first_seen", async () => {
    const before = {
      companies: (await db.select().from(t.companies)).length,
      sightings: (await db.select().from(t.sightings)).length
    };
    const results = await runRadarIngestion({ db, radarSources: [a, b], now: day2 });
    expect(results.every((r) => r.ok && r.created === 0)).toBe(true);
    expect((await db.select().from(t.companies)).length).toBe(before.companies);
    expect((await db.select().from(t.sightings)).length).toBe(before.sightings);
    const [soliome] = await db.select().from(t.companies).where(eq(t.companies.name, "Soliome"));
    expect(soliome.firstSeenAt).toEqual(day1);
  });
});

describe("radarFindsByWeek", () => {
  it("leaves out each source's first import and counts later new finds", async () => {
    const day = 86_400_000;
    const start = new Date("2031-03-01T12:00:00Z");
    const at = (d: number) => new Date(start.getTime() + d * day);
    // A failed run is not the first import.
    await runRadarIngestion({
      db,
      radarSources: [fakeSource("weekly-first", new Error("down"))],
      now: at(0)
    });
    const bulk = fakeSource("weekly-first", [
      rec({ externalId: "1", name: "Bulk One" }),
      rec({ externalId: "2", name: "Bulk Two" })
    ]);
    await runRadarIngestion({ db, radarSources: [bulk], now: at(1) });
    const later = fakeSource("weekly-first", [
      rec({ externalId: "1", name: "Bulk One" }),
      rec({ externalId: "3", name: "Fresh Find" })
    ]);
    await runRadarIngestion({ db, radarSources: [later], now: at(10) });
    // A source added later: its own first import is left out too.
    const added = fakeSource("weekly-added", [rec({ externalId: "9", name: "Old Listing" })]);
    await runRadarIngestion({ db, radarSources: [added], now: at(11) });

    const { weeks } = await radarFindsByWeek.run({ weeks: 3, now: at(14) }, { db });
    expect(weeks.map((w) => w.count)).toEqual([0, 0, 1]);
  });
});
