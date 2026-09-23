import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "@/db";
import { activityLog, grants, sources } from "@/db/schema";
import { caGrants } from "./ca-grants";
import { grantsGov } from "./grants-gov";
import type { Fetch, GrantRecord, GrantSource } from "./types";

export const GRANT_SOURCES: GrantSource[] = [grantsGov, caGrants];

export type GrantSourceResult =
  | { slug: string; ok: true; fetched: number; created: number; updated: number }
  | { slug: string; ok: false; error: string };

const BATCH = 50;

// Insert new grants and refresh existing ones. Her board status and first_seen are never touched.
async function upsertGrants(db: Database, sourceId: string, records: GrantRecord[], now: Date) {
  const existing = new Set(
    (
      await db
        .select({ externalId: grants.externalId })
        .from(grants)
        .where(eq(grants.sourceId, sourceId))
    ).map((r) => r.externalId)
  );
  const statements: BatchItem<"sqlite">[] = records.map((r) => {
    const fields = {
      title: r.title,
      agency: r.agency,
      amountMin: r.amountMin,
      amountMax: r.amountMax,
      deadline: r.deadline,
      forProfitEligible: r.forProfitEligible,
      url: r.url,
      description: r.description,
      raw: r.raw
    };
    return db
      .insert(grants)
      .values({ sourceId, externalId: r.externalId, firstSeenAt: now, ...fields })
      .onConflictDoUpdate({ target: [grants.sourceId, grants.externalId], set: fields });
  });
  for (let i = 0; i < statements.length; i += BATCH) {
    await db.batch(
      statements.slice(i, i + BATCH) as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]
    );
  }
  const created = new Set(records.map((r) => r.externalId).filter((id) => !existing.has(id))).size;
  return { fetched: records.length, created, updated: records.length - created };
}

// Same shape as radar ingestion: fetch all in parallel, write each, a failing source is logged and skipped.
export async function runGrantIngestion({
  db,
  fetchFn = fetch,
  grantSources = GRANT_SOURCES,
  now = new Date()
}: {
  db: Database;
  fetchFn?: Fetch;
  grantSources?: GrantSource[];
  now?: Date;
}): Promise<GrantSourceResult[]> {
  const fetched = await Promise.allSettled(grantSources.map((s) => s.fetchRecords(fetchFn)));
  const results: GrantSourceResult[] = [];

  for (const [i, source] of grantSources.entries()) {
    const [row] = await db
      .insert(sources)
      .values({ slug: source.slug, name: source.name, kind: source.kind, url: source.url })
      .onConflictDoUpdate({
        target: sources.slug,
        set: { name: source.name, kind: source.kind, url: source.url }
      })
      .returning({ id: sources.id });

    const outcome = fetched[i];
    let result: GrantSourceResult;
    try {
      if (outcome.status === "rejected") throw outcome.reason;
      // A source can list the same grant twice; keep the last. Skip grants that already closed.
      const today = new Date(now);
      today.setUTCHours(0, 0, 0, 0);
      const open = outcome.value.filter((r) => !r.deadline || r.deadline >= today);
      const unique = [...new Map(open.map((r) => [r.externalId, r])).values()];
      result = { slug: source.slug, ok: true, ...(await upsertGrants(db, row.id, unique, now)) };
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
      action: "ingestGrants",
      entityType: "source",
      entityId: row.id,
      summary: result.ok
        ? `${source.name}: ${result.fetched} grants, ${result.created} new`
        : `${source.name} failed: ${result.error.slice(0, 200)}`,
      data: result
    });
    results.push(result);
  }
  return results;
}
