import { readFileSync } from "node:fs";
import type { Document } from "@mendable/firecrawl-js";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/db";
import * as t from "@/db/schema";
import {
  ENTRY_SCHEMA,
  isOutputLimit,
  scrapeOptions,
  toRecords,
  type Scrape
} from "@/ingest/monitors/firecrawl";
import { duePages, runMonitors } from "@/ingest/monitors";
import { MONITORS, NAME_WEBSITE_SCHEMA, type Monitor } from "@/ingest/monitors/pages";
import { runRadarIngestion } from "@/ingest/radar/run";
import { thirdDerivative } from "@/ingest/radar/third-derivative";
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

  it("asks Third Derivative for name and website only", () => {
    const options = scrapeOptions(monitor("fc-third-derivative"));
    expect(options.formats).toEqual([
      expect.objectContaining({ type: "json", schema: NAME_WEBSITE_SCHEMA })
    ]);
    expect(Object.keys(NAME_WEBSITE_SCHEMA.properties.entries.items.properties)).toEqual([
      "name",
      "website"
    ]);
  });

  it.each([
    ["fc-fashion-for-good", 48, "Syre"],
    ["fc-elemental-impact", 143, "Allume Energy"],
    ["fc-epa-sbir", 9, "EcoaTEX, LLC"],
    ["fc-climate-story-fund", 55, "Against the Tide"],
    ["fc-third-derivative", 312, "Zinc8 Energy Solutions"]
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

  it("names an output-length warning as too many entries", () => {
    const m = monitor("fc-third-derivative");
    const doc = {
      json: undefined,
      warning: "JSON extraction failed: the response exceeded the model's maximum output length."
    };
    expect(() => toRecords(m, doc)).toThrow(/^Too many entries for one extraction/);
  });

  it("tells output-length errors apart from timeouts", () => {
    expect(isOutputLimit("LLM output exceeded maximum output length")).toBe(true);
    expect(isOutputLimit("Max output tokens reached")).toBe(true);
    expect(isOutputLimit('{"finish_reason":"length"}')).toBe(true);
    expect(isOutputLimit("Request timed out")).toBe(false);
    expect(isOutputLimit("Scrape timed out after waiting in the concurrency queue")).toBe(false);
    expect(isOutputLimit("Payload Too Large: content length exceeded")).toBe(false);
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
  });

  it("checks Third Derivative's full list on day 3, then nothing is due", async () => {
    const third = await runMonitors({
      db,
      scrape: recorded,
      now: new Date("2026-10-03T12:00:00Z")
    });
    expect(third).toEqual([expect.objectContaining({ slug: "fc-third-derivative", ok: true })]);
    expect(third[0]).toMatchObject({ fetched: 312 });

    // Nothing is due on day 4.
    expect(
      await runMonitors({ db, scrape: recorded, now: new Date("2026-10-04T12:00:00Z") })
    ).toEqual([]);
  });

  it("checks Third Derivative monthly while the others stay weekly", async () => {
    const td = monitor("fc-third-derivative");
    expect(td.everyDays).toBe(30);
    expect(MONITORS.filter((m) => m.slug !== td.slug).every((m) => !m.everyDays)).toBe(true);

    // Two weeks after its check it is not due; a month after, it is.
    const twoWeeks = await duePages(db, [td], new Date("2026-10-17T12:00:00Z"));
    expect(twoWeeks).toEqual([]);
    const month = await duePages(db, [td], new Date("2026-11-02T12:00:00Z"));
    expect(month.map((m) => m.slug)).toEqual(["fc-third-derivative"]);
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

  it("records an output-length failure as too many entries, not a timeout", async () => {
    const td = monitor("fc-third-derivative");
    const tooLong: Scrape = async () => {
      // The shape the SDK throws: an SdkError with the API's error text and details.
      throw Object.assign(new Error("Extraction failed"), {
        status: 500,
        details: { error: "LLM response exceeded the model's maximum output length" }
      });
    };
    const now = new Date("2026-11-05T12:00:00Z");
    const [result] = await runMonitors({ db, scrape: tooLong, monitors: [td], now });
    expect(result).toMatchObject({ slug: td.slug, ok: false });

    const [src] = await db
      .select({ status: t.sources.lastStatus, error: t.sources.lastError })
      .from(t.sources)
      .where(eq(t.sources.slug, td.slug));
    expect(src.status).toBe("failed");
    expect(src.error).toMatch(/^Too many entries for one extraction: /);
    expect(src.error).toMatch(/maximum output length/);
    expect(src.error).not.toMatch(/timed out/i);
  });
});

describe("Third Derivative portfolio feed", () => {
  let db: Database;
  let cleanup: () => void;
  beforeAll(async () => {
    ({ db, cleanup } = await freshDb());
  });
  afterAll(() => cleanup());

  const xml = readFileSync("tests/fixtures/third-derivative.xml", "utf8");
  const feedFetch = (body: string) =>
    (async (input: RequestInfo | URL) => {
      if (String(input) !== "https://www.third-derivative.org/portfolio/rss.xml")
        throw new Error(`Unexpected fetch ${input}`);
      return new Response(body);
    }) as typeof fetch;

  it("reads the newest startups with sectors and cohort year", async () => {
    const records = await thirdDerivative.fetchRecords(feedFetch(xml));
    expect(records).toHaveLength(10);
    expect(records[0]).toMatchObject({
      externalId: "pristinz",
      name: "PRISTINZ",
      website: null,
      cohortYear: 2026,
      tags: ["Buildings", "Future Industries Partnership"],
      raw: { page: "https://www.third-derivative.org/portfolio/pristinz" }
    });
    expect(records[0].description).toMatch(/^Buildings in tropical regions/);
    expect(records.find((r) => r.name === "Mitti Labs")?.tags).toContain(
      "Carbon & Methane Management"
    );
  });

  it("matches the full Firecrawl list by name and adds only new startups", async () => {
    const day1 = new Date("2026-10-01T12:00:00Z");
    const [full] = await runMonitors({
      db,
      scrape: async () => fixture("fc-third-derivative"),
      monitors: [monitor("fc-third-derivative")],
      now: day1
    });
    expect(full).toMatchObject({ ok: true, fetched: 312, created: 312 });

    // Every startup in today's feed is already on the full list.
    const day2 = new Date("2026-10-02T12:00:00Z");
    const [feed] = await runRadarIngestion({
      db,
      fetchFn: feedFetch(xml),
      radarSources: [thirdDerivative],
      now: day2
    });
    expect(feed).toMatchObject({ ok: true, fetched: 10, created: 0 });

    // A startup added after the monthly check arrives through the feed.
    const added = xml.replace(
      "<item>",
      `<item><title>Newco Climate</title><link>https://www.third-derivative.org/portfolio/newco</link><category>Cohort 26-2</category></item><item>`
    );
    const [next] = await runRadarIngestion({
      db,
      fetchFn: feedFetch(added),
      radarSources: [thirdDerivative],
      now: new Date("2026-10-03T12:00:00Z")
    });
    expect(next).toMatchObject({ ok: true, fetched: 11, created: 1 });
    const [pristinz] = await db
      .select({ id: t.companies.id })
      .from(t.companies)
      .where(eq(t.companies.normalizedName, "pristinz"));
    const seen = await db
      .select({ sourceId: t.sightings.sourceId })
      .from(t.sightings)
      .where(eq(t.sightings.companyId, pristinz.id));
    // One company, sighted by both the page and the feed.
    expect(seen).toHaveLength(2);
  });
});
