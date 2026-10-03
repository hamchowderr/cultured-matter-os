import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/db";
import * as t from "@/db/schema";
import { agfundernews } from "@/ingest/radar/agfundernews";
import { closedLoop, isStartup } from "@/ingest/radar/closed-loop";
import { gca, winnerWebsite } from "@/ingest/radar/gca";
import { headlineCompany } from "@/ingest/radar/news-feed";
import { displayName, nsf } from "@/ingest/radar/nsf";
import { runRadarIngestion } from "@/ingest/radar/run";
import { freshDb } from "./test-db";

// Small real samples saved from each source on 2026-10-03.
const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

const json = (data: unknown) =>
  new Response(JSON.stringify(data), { headers: { "x-wp-totalpages": "1" } });

const terms = (pairs: [number, string][]) => pairs.map(([id, name]) => ({ id, name }));

// Serves the saved fixtures by URL, like the live sites would.
const fakeFetch = (async (input: string | URL) => {
  const url = String(input);
  if (url.startsWith("https://agfundernews.com/feed"))
    return new Response(fixture("agfundernews.xml"));
  if (url.startsWith("https://api.nsf.gov/")) {
    // Every keyword query returns the same page; the reader dedupes by award.
    const program = new URL(url).searchParams.get("fundProgramName");
    return program === "SBIR"
      ? new Response(fixture("nsf-awards.json"))
      : json({ response: { award: [] } });
  }
  if (url.includes("hmfoundation.com/wp-json/wp/v2/gca_winner?"))
    return json(JSON.parse(fixture("gca-winners.json")));
  if (url.includes("/gca_winner_year?"))
    return json(
      terms([
        [408, "2026"],
        [381, "2025"],
        [306, "2017"],
        [298, "2019"]
      ])
    );
  if (url.includes("/gca_winner_area?"))
    return json(
      terms([
        [383, "Sustainable materials and processes"],
        [384, "Responsible production"]
      ])
    );
  if (url.includes("/hmf_project_country?"))
    return json(
      terms([
        [164, "Bangladesh"],
        [199, "Japan"],
        [173, "USA"],
        [189, "Kenya"]
      ])
    );
  if (url.includes("/clp/v2/portfolios?")) return json(JSON.parse(fixture("clp-portfolios.json")));
  if (url.includes("/wp/v2/portfolio?")) return json(JSON.parse(fixture("clp-portfolio-wp.json")));
  if (url.includes("/portfoliofund?"))
    return json(
      terms([
        [12, "Infrastructure"],
        [13, "Beverage"],
        [14, "Venture"],
        [16, "Leadership"],
        [159, "Circular Plastics"]
      ])
    );
  if (url.includes("/portfoliosector?"))
    return json(
      terms([
        [83, "Recycling Infrastructure"],
        [85, "Consumer Goods &amp; Packaging"],
        [86, "Supply Chain Optimisation"]
      ])
    );
  if (url.includes("/portfolioarea?") || url.includes("/portfolioother?")) return json([]);
  return new Response("not found", { status: 404, statusText: "Not Found" });
}) as typeof fetch;

describe("news feed company rule", () => {
  const item = (title: string, html: string) => ({ title, "content:encoded": html });

  it("takes the headline company that links its home page", () => {
    expect(
      headlineCompany(
        item(
          "Exclusive: ArkeaBio raises $15m for livestock methane tech",
          `<a href="https://www.breakthroughenergy.org/">Breakthrough Energy</a>
           <a href="https://www.arkeabio.com/">ArkeaBio</a>`
        ),
        "agfundernews.com"
      )
    ).toEqual({ name: "ArkeaBio", website: "https://www.arkeabio.com/" });
  });

  it("skips deep links, investors, socials and names missing from the headline", () => {
    const none = (title: string, html: string) =>
      expect(headlineCompany(item(title, html), "agfundernews.com")).toBeNull();
    none(
      "Spearhead Bio lands seed round",
      `<a href="https://danforthtechnology.com/spearhead-bio/">Spearhead Bio</a>`
    );
    none("Builders VC backs a robot", `<a href="https://www.builders.vc/">Builders VC</a>`);
    none("Acme raises $2m", `<a href="https://www.linkedin.com/">Acme</a>`);
    none("A market for saline agriculture", `<a href="https://www.fao.org/">FAO</a>`);
    none("Acme raises $2m", `<a href="https://agfundernews.com/">Acme</a>`);
  });
});

describe("AgFunderNews reader", () => {
  it("keeps only startup news with a resolvable company site", async () => {
    const records = await agfundernews.fetchRecords(fakeFetch);
    // Impossible Foods is not tagged startup news; Spearhead Bio links a parent's page;
    // the Signals roundup links articles, not home pages.
    expect(records.map((r) => r.name)).toEqual(["ArkeaBio", "Lilac Agriculture"]);
    expect(records[0]).toMatchObject({
      externalId: "arkeabio.com",
      website: "https://www.arkeabio.com/",
      tags: expect.arrayContaining(["Startups & funding", "Agtech"])
    });
    expect(records[0].description).not.toMatch(/appeared first on/);
  });
});

describe("NSF awards reader", () => {
  it("cleans shouting company names", () => {
    expect(displayName("RETURN TO VENDOR, CO")).toBe("Return to Vendor");
    expect(displayName("FLO MATERIALS, INC.")).toBe("Flo Materials");
    expect(displayName("ZeroBlue LLC")).toBe("ZeroBlue");
  });

  it("keeps small business awards whose project fits a category", async () => {
    const records = await nsf.fetchRecords(fakeFetch);
    const names = records.map((r) => r.name);
    expect(names).toContain("Reclamation Factory");
    expect(names).toContain("Flo Materials");
    expect(new Set(names).size).toBe(names.length);
    const flo = records.find((r) => r.name === "Flo Materials")!;
    expect(flo).toMatchObject({
      externalId: "flo materials",
      website: null,
      description: "Dynamic Covalent Polymers for Transition to Closed-loop Plastics Economy",
      cohortYear: 2026
    });
    expect((flo.raw as { awardId: string }).awardId).toBe("2538148");
  });
});

describe("Global Change Award reader", () => {
  it("reads the website from both page layouts", () => {
    expect(winnerWebsite(`<p>WEBSITE<br><a href="https://www.threadbridge.tech">x</a></p>`)).toBe(
      "https://www.threadbridge.tech/"
    );
    expect(
      winnerWebsite(
        `<strong>Website</strong>:&nbsp;<a rel="x" href="http://greennettletextiles.com/?fbclid=abc">g</a>`
      )
    ).toBe("http://greennettletextiles.com/");
    expect(winnerWebsite("<p>No link here</p>")).toBeNull();
  });

  it("maps winners with year, country and area", async () => {
    const records = await gca.fetchRecords(fakeFetch);
    expect(records.map((r) => r.name)).toEqual([
      "threadBridge",
      "Renasens",
      "unspun",
      "Green Nettle Textile"
    ]);
    expect(records[0]).toMatchObject({
      website: "https://www.threadbridge.tech/",
      cohortYear: 2026
    });
    expect(records[1].website).toBeNull();
    expect(records[2]).toMatchObject({ website: "https://unspun.io/", cohortYear: 2017 });
    expect((records[3].raw as { countries: string[] }).countries).toEqual(["Kenya"]);
  });
});

describe("Closed Loop Partners reader", () => {
  it("keeps venture and circular plastics companies, not city loans or buyouts", async () => {
    expect(isStartup(["Venture"])).toBe(true);
    expect(isStartup(["Circular Plastics", "Venture"])).toBe(true);
    expect(isStartup(["Circular Plastics"])).toBe(true);
    expect(isStartup(["Circular Plastics", "Infrastructure"])).toBe(false);
    expect(isStartup(["Leadership"])).toBe(false);

    const records = await closedLoop.fetchRecords(fakeFetch);
    expect(records.map((r) => r.name).sort()).toEqual([
      "AMP Robotics",
      "Algramo",
      "Greyparrot",
      "Supersede"
    ]);
    const algramo = records.find((r) => r.name === "Algramo")!;
    expect(algramo.website).toBe("https://www.algramo.com/");
    expect(algramo.description).toBeTruthy();
    expect(algramo.tags).toContain("Consumer Goods & Packaging");
  });
});

describe("new feeds through runRadarIngestion", () => {
  let db: Database;
  let cleanup: () => void;
  beforeAll(async () => {
    ({ db, cleanup } = await freshDb());
  });
  afterAll(() => cleanup());

  const radarSources = [nsf, agfundernews, gca, closedLoop];

  it("ingests idempotently and records one sighting per record", async () => {
    const first = await runRadarIngestion({
      db,
      fetchFn: fakeFetch,
      radarSources,
      now: new Date("2026-10-03T12:00:00Z")
    });
    expect(first.every((r) => r.ok)).toBe(true);
    const fetched = first.reduce((n, r) => n + (r.ok ? r.fetched : 0), 0);
    expect((await db.select().from(t.sightings)).length).toBe(fetched);
    const companies = (await db.select().from(t.companies)).length;

    const second = await runRadarIngestion({
      db,
      fetchFn: fakeFetch,
      radarSources,
      now: new Date("2026-10-04T12:00:00Z")
    });
    expect(second.every((r) => r.ok && r.created === 0)).toBe(true);
    expect((await db.select().from(t.companies)).length).toBe(companies);
    expect((await db.select().from(t.sightings)).length).toBe(fetched);
  });

  it("keeps going when one feed fails", async () => {
    const down = (async () =>
      new Response("", { status: 503, statusText: "Service Unavailable" })) as typeof fetch;
    const results = await runRadarIngestion({
      db,
      fetchFn: (async (input: string | URL, init?: RequestInit) =>
        String(input).includes("agfundernews")
          ? down(input, init)
          : fakeFetch(input, init)) as typeof fetch,
      radarSources
    });
    expect(results.find((r) => r.slug === "agfundernews")).toMatchObject({ ok: false });
    expect(results.filter((r) => r.ok)).toHaveLength(3);
  });
});
