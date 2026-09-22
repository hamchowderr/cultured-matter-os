import type { BatchItem } from "drizzle-orm/batch";
import { eq } from "drizzle-orm";

import type { Database } from "@/db";
import { companies, sightings } from "@/db/schema";
import { categorize } from "@/lib/categories";
import { normalizeDomain, normalizeName } from "@/lib/normalize";
import type { RadarRecord } from "./types";

type Known = {
  id: string;
  domain: string | null;
  normalizedName: string;
  categories: string[];
  website: string | null;
  description: string | null;
  stage: string | null;
  cohortYear: number | null;
};

export type UpsertStats = { fetched: number; created: number; updated: number; skipped: number };

const BATCH = 50;

// Dedupe by normalized website domain, then by normalized name. Existing values are
// kept; only empty fields are filled, and categories accumulate across sources.
export async function upsertRecords(
  db: Database,
  sourceId: string,
  records: RadarRecord[],
  now: Date
): Promise<UpsertStats> {
  const known: Known[] = await db
    .select({
      id: companies.id,
      domain: companies.domain,
      normalizedName: companies.normalizedName,
      categories: companies.categories,
      website: companies.website,
      description: companies.description,
      stage: companies.stage,
      cohortYear: companies.cohortYear
    })
    .from(companies);
  const byDomain = new Map(known.filter((k) => k.domain).map((k) => [k.domain!, k]));
  const byName = new Map(known.map((k) => [k.normalizedName, k]));

  const statements: BatchItem<"sqlite">[] = [];
  const stats: UpsertStats = { fetched: records.length, created: 0, updated: 0, skipped: 0 };

  for (const rec of records) {
    const nameKey = normalizeName(rec.name);
    if (!nameKey) {
      stats.skipped++;
      continue;
    }
    const siteDomain = normalizeDomain(rec.website);
    // An email domain can fill in a missing domain but never decides a match.
    const fallbackDomain = normalizeDomain(rec.emailDomain);
    const cats = categorize(rec.name, rec.description, rec.tags.join(" "));

    let company = (siteDomain && byDomain.get(siteDomain)) || byName.get(nameKey);
    if (company && siteDomain && company.domain && company.domain !== siteDomain)
      company = undefined;

    if (!company) {
      const domain = [siteDomain, fallbackDomain].find((d) => d && !byDomain.has(d)) ?? null;
      company = {
        id: crypto.randomUUID(),
        domain,
        normalizedName: nameKey,
        categories: cats,
        website: rec.website ?? null,
        description: rec.description ?? null,
        stage: rec.stage ?? null,
        cohortYear: rec.cohortYear ?? null
      };
      statements.push(
        db.insert(companies).values({ ...company, name: rec.name, firstSeenAt: now })
      );
      if (domain) byDomain.set(domain, company);
      byName.set(nameKey, company);
      stats.created++;
    } else {
      const patch: Partial<Known> = {};
      const domain = [siteDomain, fallbackDomain].find((d) => d && !byDomain.has(d));
      if (!company.domain && domain) patch.domain = domain;
      if (!company.website && rec.website) patch.website = rec.website;
      if (!company.description && rec.description) patch.description = rec.description;
      if (!company.stage && rec.stage) patch.stage = rec.stage;
      if (!company.cohortYear && rec.cohortYear) patch.cohortYear = rec.cohortYear;
      const merged = [...new Set([...company.categories, ...cats])];
      if (merged.length !== company.categories.length) patch.categories = merged;

      if (Object.keys(patch).length) {
        statements.push(db.update(companies).set(patch).where(eq(companies.id, company.id)));
        Object.assign(company, patch);
        if (patch.domain) byDomain.set(patch.domain, company);
        stats.updated++;
      }
    }

    statements.push(
      db
        .insert(sightings)
        .values({
          companyId: company.id,
          sourceId,
          externalId: rec.externalId,
          seenAt: now,
          raw: rec.raw
        })
        .onConflictDoUpdate({
          target: [sightings.sourceId, sightings.externalId],
          set: { companyId: company.id, seenAt: now, raw: rec.raw }
        })
    );
  }

  for (let i = 0; i < statements.length; i += BATCH) {
    const chunk = statements.slice(i, i + BATCH) as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
    await db.batch(chunk);
  }
  return stats;
}
