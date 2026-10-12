import { inArray } from "drizzle-orm";

import { db as appDb, type Database } from "@/db";
import { sources } from "@/db/schema";
import { runRadarIngestion } from "@/ingest/radar/run";
import { firecrawlScrape, monitorSource, type Scrape } from "./firecrawl";
import { CHECK_EVERY_DAYS, MONITORS, type Monitor } from "./pages";

export { MONITORS } from "./pages";

const DAY = 24 * 60 * 60 * 1000;
// A page's check time is the start of the run that checked it, and the daily cron's start moves
// by seconds from day to day (or more for a run started by hand). Without slack, a page checked
// a week ago at 12:00:40 would not be due at 12:00:10 today and would wait a whole extra day.
// Any value under a day works; two hours also covers a late or hand-started run.
const SLACK = 2 * 60 * 60 * 1000;

// Pages due a check: never checked or failed last time first, then the oldest check.
export async function duePages(
  db: Database,
  monitors: Monitor[],
  now: Date,
  { everyDays = CHECK_EVERY_DAYS } = {}
): Promise<Monitor[]> {
  const rows = await db
    .select({ slug: sources.slug, at: sources.lastCheckedAt, status: sources.lastStatus })
    .from(sources)
    .where(
      inArray(
        sources.slug,
        monitors.map((m) => m.slug)
      )
    );
  const last = new Map(rows.map((r) => [r.slug, r]));
  const rank = (m: Monitor) => {
    const row = last.get(m.slug);
    if (!row?.at || row.status === "failed") return 0;
    return row.at.getTime();
  };
  // A page's own everyDays wins over the run's default.
  const cutoff = (m: Monitor) => now.getTime() - (m.everyDays ?? everyDays) * DAY + SLACK;
  return monitors
    .filter((m) => rank(m) <= cutoff(m))
    .sort((a, b) => rank(a) - rank(b));
}

// Scrapes the pages that are due and stores entries not already known, with a sighting.
// Uses Radar's runner, so dedupe, sightings and per-page failure logging match the feeds.
export async function runMonitors({
  db,
  scrape,
  monitors = MONITORS,
  now = new Date(),
  everyDays
}: {
  db: Database;
  scrape: Scrape;
  monitors?: Monitor[];
  now?: Date;
  everyDays?: number;
}) {
  const due = await duePages(db, monitors, now, { everyDays });
  if (!due.length) return [];
  return runRadarIngestion({
    db,
    radarSources: due.map((m) => monitorSource(m, scrape)),
    now
  });
}

// Runs every due monitor against the app database with the live Firecrawl client, in one go
// (npm run ingest:monitors). The scheduled run is the agent server's workflow, one page per step.
export function ingestMonitors() {
  return runMonitors({ db: appDb, scrape: firecrawlScrape() });
}
