import { eq } from "drizzle-orm";

import type { Database } from "@/db";
import { activityLog, sources } from "@/db/schema";
import { agfundernews } from "./agfundernews";
import { closedLoop } from "./closed-loop";
import { ctvc } from "./ctvc";
import { gca } from "./gca";
import { greentown } from "./greentown";
import { nsf } from "./nsf";
import { sosv } from "./sosv";
import { thirdDerivative } from "./third-derivative";
import type { Fetch, RadarSource } from "./types";
import { upsertRecords, type UpsertStats } from "./upsert";
import { yc } from "./yc";

export const RADAR_SOURCES: RadarSource[] = [
  sosv,
  greentown,
  yc,
  ctvc,
  nsf,
  agfundernews,
  gca,
  closedLoop,
  thirdDerivative
];

export type SourceResult =
  ({ slug: string; ok: true } & UpsertStats) | { slug: string; ok: false; error: string };

// Fetches every source in parallel, then writes each one. A failing source is
// recorded on its row and in the activity log; the others still run.
export async function runRadarIngestion({
  db,
  fetchFn = fetch,
  radarSources = RADAR_SOURCES,
  now = new Date()
}: {
  db: Database;
  fetchFn?: Fetch;
  radarSources?: RadarSource[];
  now?: Date;
}): Promise<SourceResult[]> {
  const fetched = await Promise.allSettled(radarSources.map((s) => s.fetchRecords(fetchFn)));
  const results: SourceResult[] = [];

  for (const [i, source] of radarSources.entries()) {
    const [row] = await db
      .insert(sources)
      .values({ slug: source.slug, name: source.name, kind: source.kind, url: source.url })
      .onConflictDoUpdate({
        target: sources.slug,
        set: { name: source.name, kind: source.kind, url: source.url }
      })
      .returning({ id: sources.id });

    const outcome = fetched[i];
    let result: SourceResult;
    try {
      if (outcome.status === "rejected") throw outcome.reason;
      const stats = await upsertRecords(db, row.id, outcome.value, now);
      result = { slug: source.slug, ok: true, ...stats };
    } catch (e) {
      result = { slug: source.slug, ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    await db
      .update(sources)
      .set({
        lastCheckedAt: now,
        lastStatus: result.ok ? "ok" : "failed",
        lastError: result.ok ? null : result.error.slice(0, 1000)
      })
      .where(eq(sources.id, row.id));
    await db.insert(activityLog).values({
      // Stamped with the run time, the same time new companies get as firstSeenAt.
      at: now,
      action: "ingestRadar",
      entityType: "source",
      entityId: row.id,
      summary: result.ok
        ? `${source.name}: ${result.fetched} fetched, ${result.created} new, ${result.updated} updated`
        : `${source.name} failed: ${result.error.slice(0, 200)}`,
      data: result
    });
    results.push(result);
  }
  return results;
}
