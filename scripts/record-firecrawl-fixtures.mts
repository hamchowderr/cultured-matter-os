// Records one live Firecrawl response per monitored page into tests/fixtures/firecrawl/.
// Spends credits (5 per page). Pages that already have a fixture are skipped;
// delete a fixture file to re-record it. Usage: tsx scripts/record-firecrawl-fixtures.mts [slug...]
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import Firecrawl from "@mendable/firecrawl-js";

import { scrapeOptions } from "@/ingest/monitors/firecrawl";
import { MONITORS } from "@/ingest/monitors/pages";

const DIR = "tests/fixtures/firecrawl";
const only = process.argv.slice(2);
const apiKey = process.env.FIRECRAWL_API_KEY;
if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not set");

// maxRetries counts attempts in this SDK: 1 means a single call per page.
const client = new Firecrawl({ apiKey, maxRetries: 1 });
mkdirSync(DIR, { recursive: true });

const before = await client.getCreditUsage();
const todo = MONITORS.filter(
  (m) => (!only.length || only.includes(m.slug)) && !existsSync(`${DIR}/${m.slug}.json`)
);
const results = await Promise.allSettled(
  todo.map(async (m) => {
    const doc = await client.scrape(m.url, scrapeOptions(m));
    const fixture = {
      json: doc.json,
      metadata: {
        statusCode: doc.metadata?.statusCode,
        sourceURL: doc.metadata?.sourceURL,
        title: doc.metadata?.title
      },
      warning: doc.warning
    };
    writeFileSync(`${DIR}/${m.slug}.json`, JSON.stringify(fixture, null, 2) + "\n");
    const count = (doc.json as { entries?: unknown[] } | undefined)?.entries?.length ?? 0;
    return `${m.slug}: ${count} entries`;
  })
);
for (const [i, r] of results.entries())
  console.log(r.status === "fulfilled" ? r.value : `${todo[i].slug} failed: ${r.reason}`);

const after = await client.getCreditUsage();
console.log(
  `credits: ${before.remainingCredits} -> ${after.remainingCredits} (used ${before.remainingCredits - after.remainingCredits}), plan ${after.planCredits ?? "?"}`
);
