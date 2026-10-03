import {
  and,
  count,
  desc,
  eq,
  exists,
  getTableColumns,
  gt,
  inArray,
  like,
  or,
  sql,
  type SQL
} from "drizzle-orm";
import { z } from "zod/v4";

import { companies, sightings, sources } from "@/db/schema";
import type { Executor } from "@/db";
import { STAGE_GROUPS, STAGE_MATCHERS, type StageGroup } from "@/lib/stages";
import { ActionError, defineAction } from "./define";
import { companySchema, id, limit, note, offset } from "./schemas";

const companyStatus = z.enum(["new", "starred", "shortlisted", "passed"]);

export const radarCompanySchema = companySchema.extend({ sources: z.array(z.string()) });

// Names of every source a company was seen in, as a JSON array.
const sourceNames = sql<string>`(
  select json_group_array(distinct so.name) from sightings si
  join sources so on so.id = si.source_id
  where si.company_id = "companies"."id"
)`;

function stageFilter(group: StageGroup): SQL | undefined {
  const lower = sql`lower(${companies.stage})`;
  return or(
    ...STAGE_MATCHERS[group].map((m) =>
      m.endsWith("*") ? like(lower, `${m.slice(0, -1)}%`) : eq(lower, m)
    )
  );
}

export const searchCompanies = defineAction({
  name: "searchCompanies",
  description:
    "Search radar companies by text, category, stage group, source, status, or first seen after a date. Newest first.",
  kind: "read",
  input: z.object({
    query: z.string().trim().optional(),
    categories: z.array(z.string()).optional(),
    stage: z.enum(STAGE_GROUPS).optional(),
    sourceSlug: z.string().optional(),
    statuses: z.array(companyStatus).optional(),
    seenSince: z.coerce.date().optional(),
    limit,
    offset
  }),
  output: z.object({ companies: z.array(radarCompanySchema), total: z.number() }),
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
      input.stage ? stageFilter(input.stage) : undefined,
      input.statuses?.length ? inArray(companies.status, input.statuses) : undefined,
      input.seenSince ? gt(companies.firstSeenAt, input.seenSince) : undefined,
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
        .select({ ...getTableColumns(companies), sources: sourceNames })
        .from(companies)
        .where(where)
        .orderBy(desc(companies.firstSeenAt), companies.name)
        .limit(input.limit)
        .offset(input.offset),
      db.select({ total: count() }).from(companies).where(where)
    ]);
    return {
      companies: rows.map((r) => ({ ...r, sources: JSON.parse(r.sources ?? "[]") as string[] })),
      total
    };
  }
});

export const getCompany = defineAction({
  name: "getCompany",
  description: "One radar company with every source it was seen in, when, and the source link.",
  kind: "read",
  input: z.object({ companyId: id }),
  output: z.object({
    company: companySchema,
    sightings: z.array(
      z.object({
        source: z.string(),
        seenAt: z.date(),
        link: z.string().nullable()
      })
    )
  }),
  async handler(input, db) {
    const [company] = await db.select().from(companies).where(eq(companies.id, input.companyId));
    if (!company) throw new ActionError("not_found", "Company not found");
    const rows = await db
      .select({ source: sources.name, seenAt: sightings.seenAt, raw: sightings.raw })
      .from(sightings)
      .innerJoin(sources, eq(sightings.sourceId, sources.id))
      .where(eq(sightings.companyId, company.id))
      .orderBy(sources.name);
    return {
      company,
      sightings: rows.map((r) => {
        const raw = (r.raw ?? {}) as { link?: string; issue?: string; url?: string };
        return {
          source: r.source,
          seenAt: r.seenAt,
          link: raw.link ?? raw.issue ?? raw.url ?? null
        };
      })
    };
  }
});

export const radarFacets = defineAction({
  name: "radarFacets",
  description:
    "Counts for the Radar filters: per source, per status, per category (most first), and how many are new since a date.",
  kind: "read",
  input: z.object({ newSince: z.coerce.date().optional() }),
  output: z.object({
    total: z.number(),
    newCount: z.number(),
    statuses: z.record(z.string(), z.number()),
    sources: z.array(z.object({ slug: z.string(), name: z.string(), count: z.number() })),
    categories: z.array(z.object({ name: z.string(), count: z.number() }))
  }),
  async handler(input, db) {
    const [statusRows, sourceRows, [newRow], categoryRows] = await Promise.all([
      db.select({ status: companies.status, n: count() }).from(companies).groupBy(companies.status),
      db
        .select({
          slug: sources.slug,
          name: sources.name,
          count: sql<number>`count(distinct ${sightings.companyId})`
        })
        .from(sources)
        .leftJoin(sightings, eq(sightings.sourceId, sources.id))
        .groupBy(sources.id)
        .orderBy(sources.name),
      input.newSince
        ? db.select({ n: count() }).from(companies).where(gt(companies.firstSeenAt, input.newSince))
        : Promise.resolve([{ n: 0 }]),
      db.all<{ name: string; count: number }>(sql`
        select value as name, count(*) as count
        from companies, json_each(companies.categories)
        group by value
        order by count desc, value
      `)
    ]);
    const statuses = Object.fromEntries(statusRows.map((r) => [r.status, r.n]));
    return {
      total: statusRows.reduce((s, r) => s + r.n, 0),
      newCount: newRow.n,
      statuses,
      sources: sourceRows,
      categories: categoryRows.map((r) => ({ name: r.name, count: Number(r.count) }))
    };
  }
});

async function setStatus(
  db: Executor,
  companyId: string,
  status: z.infer<typeof companyStatus>,
  statusNote: string | undefined | null
) {
  const [row] = await db
    .update(companies)
    .set({ status, statusNote: statusNote ?? null, statusChangedAt: new Date() })
    .where(eq(companies.id, companyId))
    .returning();
  if (!row) throw new ActionError("not_found", "Company not found");
  return row;
}

const logFor = (verb: string) => (_input: unknown, company: { id: string; name: string }) => ({
  entityType: "company",
  entityId: company.id,
  summary: `${verb} ${company.name}`
});

export const starCompany = defineAction({
  name: "starCompany",
  description: "Star a radar company to look at later, with an optional note.",
  kind: "write",
  input: z.object({ companyId: id, note }),
  output: companySchema,
  handler: (input, db) => setStatus(db, input.companyId, "starred", input.note),
  log: logFor("Starred")
});

export const shortlistCompany = defineAction({
  name: "shortlistCompany",
  description: "Add a radar company to the shortlist, with an optional note.",
  kind: "write",
  input: z.object({ companyId: id, note }),
  output: companySchema,
  handler: (input, db) => setStatus(db, input.companyId, "shortlisted", input.note),
  log: logFor("Shortlisted")
});

export const passCompany = defineAction({
  name: "passCompany",
  description: "Pass on a radar company, with an optional note on why.",
  kind: "write",
  input: z.object({ companyId: id, note }),
  output: companySchema,
  handler: (input, db) => setStatus(db, input.companyId, "passed", input.note),
  log: logFor("Passed on")
});

export const resetCompany = defineAction({
  name: "resetCompany",
  description:
    "Undo a star, shortlist or pass: put the company back to unreviewed and clear its note.",
  kind: "write",
  input: z.object({ companyId: id }),
  output: companySchema,
  handler: (input, db) => setStatus(db, input.companyId, "new", null),
  log: logFor("Moved back to review:")
});
