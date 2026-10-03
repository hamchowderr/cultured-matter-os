import { readFileSync } from "node:fs";
import type { Document } from "@mendable/firecrawl-js";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/db";
import * as t from "@/db/schema";
import { ENTRY_SCHEMA, scrapeOptions, toRecords, type Scrape } from "@/ingest/monitors/firecrawl";
import { duePages, runMonitors } from "@/ingest/monitors";
import { MONITORS, type Monitor } from "@/ingest/monitors/pages";
import { freshDb } from "./test-db";

// Recorded Firecrawl JSON-format responses (fc-epa-sbir is built by hand from the page HTML).
const fixture = (slug: string) =>
  JSON.parse(readFileSync(`tests/fixtures/firecrawl/${slug}.json`, "utf8")) as Document;
const monitor = (slug: string) => MONITORS.find((m) => m.slug === slug)!;

// Serves the recorded response for each monitored URL; never calls Firecrawl.
const recorded: Scrape = async (url) => {
  const m = MONITORS.find((x) => x.url === url);
  if (!m) throw new Error(`No fixture for ${url}`);
  return fixture(m.slug);
};

describe("Firecrawl JSON extraction", () => {
  it("asks for the shared entry schema with the page's own prompt", () => {
    const m = monitor("fc-elemental-impact");
    expect(scrapeOptions(m).formats).toEqual([
      { type: "json", schema: ENTRY_SCHEMA, prompt: m.prompt }
    ]);
  });

  it.each([
    ["fc-fashion-for-good", 48, "Syre"],
    ["fc-elemental-impact", 143, "Allume Energy"],
    ["fc-epa-sbir", 9, "EcoaTEX, LLC"],
    ["fc-climate-story-fund", 55, "Against the Tide"]
  ])("reads %s into %i entries", (slug, n, example) => {
    const records = toRecords(monitor(slug), fixture(slug));
    expect(records).toHaveLength(n);
    expect(records.map((r) => r.name)).toContain(example);
    expect(new Set(records.map((r) => r.externalId)).size).toBe(n);
  });

  it("drops links back to the monitored site and keeps the page's details", () => {
    const [syre] = toRecords(monitor("fc-fashion-for-good"), fixture("fc-fashion-for-good"));
    expect(syre).toMatchObject({
      externalId: "syre",
      name: "Syre",
      website: null,
      tags: ["Early Stage"],
      raw: {
        monitor: "fc-fashion-for-good",
        website: "https://www.fashionforgood.com/innovator/syre/"
      }
    });
    expect(syre.description).toMatch(/textile-to-textile recycling/);
  });

  it("keeps a real external website and tags documentary projects", () => {
    const m: Monitor = { ...monitor("fc-climate-story-fund") };
    const doc = {
      json: {
        entries: [
          { name: "Film A", website: "https://film-a.org", year: 2026 },
          { name: "Film A", website: null },
          { name: "  " },
          { title: "not an entry" }
        ]
      }
    };
    expect(toRecords(m, doc)).toEqual([
      expect.objectContaining({
        name: "Film A",
        website: "https://film-a.org",
        cohortYear: 2026,
        tags: ["Documentary"]
      })
    ]);
  });

  it("fails a page that is blocked or yields nothing", () => {
    const m = monitor("fc-epa-sbir");
    expect(() => toRecords(m, { metadata: { statusCode: 403 }, json: { entries: [] } })).toThrow(
      /403/
    );
    expect(() => toRecords(m, { json: undefined })).toThrow(/No JSON entries/);
    expect(() => toRecords(m, { json: { entries: [] } })).toThrow(/No entries/);
  });
});

describe("runMonitors", () => {
  let db: Database;
  let cleanup: () => void;
  beforeAll(async () => {
    ({ db, cleanup } = await freshDb());
  });
  afterAll(() => cleanup());

  const day1 = new Date("2026-10-01T12:00:00Z");
  const companyCount = async () => (await db.select({ n: count() }).from(t.companies))[0].n;

  it("checks at most two due pages a run, then the rest the next day", async () => {
    // A company Radar already knows from another source.
    await db
      .insert(t.companies)
      .values({ name: "SYRE", normalizedName: "syre", firstSeenAt: day1 });

    const first = await runMonitors({ db, scrape: recorded, now: day1 });
    expect(first.map((r) => r.slug)).toEqual(["fc-fashion-for-good", "fc-elemental-impact"]);
    expect(first.every((r) => r.ok)).toBe(true);
    // Syre is matched, not duplicated.
    expect(first[0]).toMatchObject({ ok: true, fetched: 48, created: 47 });

    const day2 = new Date("2026-10-02T12:00:00Z");
    const second = await runMonitors({ db, scrape: recorded, now: day2 });
    expect(second.map((r) => r.slug)).toEqual(["fc-epa-sbir", "fc-climate-story-fund"]);

    // Nothing is due on day 3.
    expect(
      await runMonitors({ db, scrape: recorded, now: new Date("2026-10-03T12:00:00Z") })
    ).toEqual([]);
  });

  it("adds a sighting for every entry and only new companies on a re-check", async () => {
    const [syre] = await db
      .select({ id: t.companies.id })
      .from(t.companies)
      .where(eq(t.companies.normalizedName, "syre"));
    const syreSightings = await db
      .select({ sourceId: t.sightings.sourceId })
      .from(t.sightings)
      .where(eq(t.sightings.companyId, syre.id));
    expect(syreSightings).toHaveLength(1);

    const before = await companyCount();
    const week = new Date("2026-10-08T12:30:00Z");
    const recheck = await runMonitors({ db, scrape: recorded, now: week });
    expect(recheck).toHaveLength(2);
    expect(recheck.every((r) => r.ok && r.created === 0)).toBe(true);
    expect(await companyCount()).toBe(before);

    const [src] = await db
      .select({ kind: t.sources.kind, status: t.sources.lastStatus })
      .from(t.sources)
      .where(eq(t.sources.slug, "fc-fashion-for-good"));
    expect(src).toEqual({ kind: "firecrawl", status: "ok" });
  });

  it("logs a failing page, keeps going, and retries it on the next run", async () => {
    const now = new Date("2026-10-20T12:00:00Z");
    const flaky: Scrape = async (url, options) => {
      if (url === monitor("fc-elemental-impact").url) throw new Error("Request timed out");
      return recorded(url, options);
    };
    const monitors = [monitor("fc-fashion-for-good"), monitor("fc-elemental-impact")];
    const results = await runMonitors({ db, scrape: flaky, monitors, now });
    expect(results).toEqual([
      expect.objectContaining({ slug: "fc-fashion-for-good", ok: true }),
      { slug: "fc-elemental-impact", ok: false, error: "Request timed out" }
    ]);

    const [src] = await db
      .select({ status: t.sources.lastStatus, error: t.sources.lastError })
      .from(t.sources)
      .where(eq(t.sources.slug, "fc-elemental-impact"));
    expect(src).toEqual({ status: "failed", error: "Request timed out" });

    // The failed page goes first the next day.
    const next = await duePages(db, MONITORS, new Date("2026-10-21T12:00:00Z"));
    expect(next[0].slug).toBe("fc-elemental-impact");
  });
});
