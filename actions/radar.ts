import { and, count, desc, eq, exists, gte, inArray, like, or, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { companies, sightings, sources } from "@/db/schema";
import type { Executor } from "@/db";
import { ActionError, defineAction } from "./define";
import { companySchema, id, limit, note, offset } from "./schemas";

export const searchCompanies = defineAction({
  name: "searchCompanies",
  description:
    "Search radar companies by text, category, stage, source, status, or first seen after a date. Newest first.",
  kind: "read",
  input: z.object({
    query: z.string().trim().optional(),
    categories: z.array(z.string()).optional(),
    stage: z.string().optional(),
    sourceSlug: z.string().optional(),
    status: z.enum(["new", "starred", "shortlisted", "passed"]).optional(),
    seenSince: z.coerce.date().optional(),
    limit,
    offset
  }),
  output: z.object({ companies: z.array(companySchema), total: z.number() }),
  async handler(input, db) {
    const where = and(
      input.query
        ? or(
            like(companies.name, `%${input.query}%`),
            like(companies.description, `%${input.query}%`)
          )
        : undefined,
      input.categories?.length
        ? exists(
            db
              .select({ one: sql`1` })
              .from(sql`json_each(${companies.categories})`)
              .where(inArray(sql`value`, input.categories))
          )
        : undefined,
      input.stage ? eq(companies.stage, input.stage) : undefined,
      input.status ? eq(companies.status, input.status) : undefined,
      input.seenSince ? gte(companies.firstSeenAt, input.seenSince) : undefined,
      input.sourceSlug
        ? exists(
            db
              .select({ one: sql`1` })
              .from(sightings)
              .innerJoin(sources, eq(sightings.sourceId, sources.id))
              .where(and(eq(sightings.companyId, companies.id), eq(sources.slug, input.sourceSlug)))
          )
        : undefined
    );

    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(companies)
        .where(where)
        .orderBy(desc(companies.firstSeenAt))
        .limit(input.limit)
        .offset(input.offset),
      db.select({ total: count() }).from(companies).where(where)
    ]);
    return { companies: rows, total };
  }
});

async function setStatus(
  db: Executor,
  companyId: string,
  status: "shortlisted" | "passed",
  statusNote: string | undefined
) {
  const [row] = await db
    .update(companies)
    .set({ status, statusNote: statusNote ?? null, statusChangedAt: new Date() })
    .where(eq(companies.id, companyId))
    .returning();
  if (!row) throw new ActionError("not_found", "Company not found");
  return row;
}

export const shortlistCompany = defineAction({
  name: "shortlistCompany",
  description: "Add a radar company to the shortlist, with an optional note.",
  kind: "write",
  input: z.object({ companyId: id, note }),
  output: companySchema,
  handler: (input, db) => setStatus(db, input.companyId, "shortlisted", input.note),
  log: (_input, company) => ({
    entityType: "company",
    entityId: company.id,
    summary: `Shortlisted ${company.name}`
  })
});

export const passCompany = defineAction({
  name: "passCompany",
  description: "Pass on a radar company, with an optional note on why.",
  kind: "write",
  input: z.object({ companyId: id, note }),
  output: companySchema,
  handler: (input, db) => setStatus(db, input.companyId, "passed", input.note),
  log: (_input, company) => ({
    entityType: "company",
    entityId: company.id,
    summary: `Passed on ${company.name}`
  })
});
