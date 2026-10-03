import { and, asc, count, desc, eq, exists, inArray, like, or, sql } from "drizzle-orm";
import { z } from "zod/v4";

import type { Executor } from "@/db";
import { companies, contactLinks, contacts, pairings } from "@/db/schema";
import { normalizeDomain, normalizeName } from "@/lib/normalize";
import { ActionError, defineAction } from "./define";
import { parseConnectionsCsv } from "@/lib/linkedin";
import { contactSchema, id, limit, note, offset, pairingSchema, type Contact } from "./schemas";

const sortColumns = {
  name: contacts.fullName,
  company: contacts.company,
  role: contacts.position,
  added: contacts.createdAt
} as const;

function contactOrder(sort: keyof typeof sortColumns, dir: "asc" | "desc") {
  const col = sortColumns[sort];
  const by = dir === "desc" ? desc : asc;
  // Blank companies and roles go to the bottom, not the top.
  const blanksLast = sql`coalesce(${col}, '') = ''`;
  return [blanksLast, by(col), asc(contacts.fullName), asc(contacts.id)];
}

export const searchContacts = defineAction({
  name: "searchContacts",
  description: "Search contacts by name, company, position, sector tag or newsletter flag.",
  kind: "read",
  input: z.object({
    query: z.string().trim().optional(),
    sector: z.string().optional(),
    newsletter: z.boolean().optional(),
    // Contacts with no company or role sort last either way; ties fall back to name.
    sort: z.enum(["name", "company", "role", "added"]).default("name"),
    dir: z.enum(["asc", "desc"]).default("asc"),
    limit,
    offset
  }),
  output: z.object({ contacts: z.array(contactSchema), total: z.number() }),
  async handler(input, db) {
    const where = and(
      input.query
        ? or(
            like(contacts.fullName, `%${input.query}%`),
            like(contacts.company, `%${input.query}%`),
            like(contacts.position, `%${input.query}%`)
          )
        : undefined,
      input.sector
        ? exists(
            db
              .select({ one: sql`1` })
              .from(sql`json_each(${contacts.sectors})`)
              .where(sql`value = ${input.sector}`)
          )
        : undefined,
      input.newsletter !== undefined ? eq(contacts.newsletter, input.newsletter) : undefined
    );
    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(contacts)
        .where(where)
        .orderBy(...contactOrder(input.sort, input.dir))
        .limit(input.limit)
        .offset(input.offset),
      db.select({ total: count() }).from(contacts).where(where)
    ]);
    return { contacts: rows, total };
  }
});

const warmPathSchema = z.object({
  contact: contactSchema,
  via: z.enum(["company", "brand"]),
  // The startup's or brand's name the contact connects to.
  target: z.string(),
  reason: z.enum(["works_at", "linked"]),
  note: z.string().nullable(),
  // The hand-made link behind a "linked" path, so it can be removed.
  linkId: z.string().nullable()
});

type WarmPath = z.input<typeof warmPathSchema>;

// Warm paths for several radar companies in a fixed number of queries, whatever the count.
// findWarmPath and countWarmPaths share it so the list and the detail panel always agree.
async function warmPathsFor(db: Executor, companyIds: string[]) {
  const result = new Map<string, WarmPath[]>(companyIds.map((cid) => [cid, []]));
  if (companyIds.length === 0) return result;

  const rows = await db
    .select({ id: companies.id, name: companies.name, domain: companies.domain })
    .from(companies)
    .where(inArray(companies.id, companyIds));
  const brands = await db.select().from(pairings).where(inArray(pairings.companyId, companyIds));

  const targets = [
    ...rows.map((c) => ({
      companyId: c.id,
      via: "company" as const,
      name: c.name,
      domain: normalizeDomain(c.domain)
    })),
    ...brands.map((b) => ({
      companyId: b.companyId,
      via: "brand" as const,
      name: b.brandName,
      domain: normalizeDomain(b.brandDomain)
    }))
  ];
  const domains = [...new Set(targets.map((t) => t.domain).filter((d): d is string => !!d))];
  const names = [...new Set(targets.map((t) => t.name))];

  // Names go in as one JSON parameter so a long list never deepens the SQL expression.
  const candidates = await db
    .select()
    .from(contacts)
    .where(
      or(
        domains.length ? inArray(contacts.companyDomain, domains) : undefined,
        names.length
          ? exists(
              db
                .select({ one: sql`1` })
                .from(sql`json_each(${JSON.stringify(names)})`)
                .where(sql`${contacts.company} like '%' || value || '%'`)
            )
          : undefined
      )
    );

  const seen = new Set<string>();
  const add = (companyId: string, p: WarmPath) => {
    const key = `${companyId}:${p.contact.id}:${p.via}:${p.target}:${p.linkId ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.get(companyId)?.push(p);
  };

  const candidateNames = candidates.map((c) => (c.company ? normalizeName(c.company) : null));
  for (const t of targets) {
    const name = normalizeName(t.name);
    candidates.forEach((c, i) => {
      const byDomain = !!t.domain && c.companyDomain === t.domain;
      const byName = !!name && candidateNames[i] === name;
      if (byDomain || byName) {
        add(t.companyId, {
          contact: c as Contact,
          via: t.via,
          target: t.name,
          reason: "works_at",
          note: null,
          linkId: null
        });
      }
    });
  }

  const companyNames = new Map(rows.map((c) => [c.id, c.name]));
  const brandIds = brands.map((b) => b.id);
  const links = await db
    .select({ link: contactLinks, contact: contacts, brand: pairings })
    .from(contactLinks)
    .innerJoin(contacts, eq(contactLinks.contactId, contacts.id))
    .leftJoin(pairings, eq(contactLinks.pairingId, pairings.id))
    .where(
      or(
        inArray(contactLinks.companyId, companyIds),
        brandIds.length ? inArray(contactLinks.pairingId, brandIds) : undefined
      )
    );
  for (const { link, contact, brand } of links) {
    const companyId = brand ? brand.companyId : link.companyId!;
    add(companyId, {
      contact: contact as Contact,
      via: brand ? "brand" : "company",
      target: brand ? brand.brandName : (companyNames.get(companyId) ?? ""),
      reason: "linked",
      note: link.note,
      linkId: link.id
    });
  }

  return result;
}

export const findWarmPath = defineAction({
  name: "findWarmPath",
  description:
    "List contacts who can reach a radar company: they work at it or at a brand paired with it (matched by domain or name), or were linked to it by hand.",
  kind: "read",
  input: z.object({ companyId: id }),
  output: z.object({ paths: z.array(warmPathSchema) }),
  async handler(input, db) {
    const [company] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, input.companyId));
    if (!company) throw new ActionError("not_found", "Company not found");
    const paths = (await warmPathsFor(db, [company.id])).get(company.id) ?? [];
    return { paths };
  }
});

export const countWarmPaths = defineAction({
  name: "countWarmPaths",
  description:
    "For a list of radar companies, how many different contacts can reach each one (same rules as findWarmPath).",
  kind: "read",
  input: z.object({ companyIds: z.array(id).max(200) }),
  output: z.object({ counts: z.record(z.string(), z.number()) }),
  async handler(input, db) {
    const ids = [...new Set(input.companyIds)];
    const paths = await warmPathsFor(db, ids);
    return {
      counts: Object.fromEntries(
        ids.map((cid) => [cid, new Set((paths.get(cid) ?? []).map((p) => p.contact.id)).size])
      )
    };
  }
});

// ---------------------------------------------------------------- Target brands and hand links

export const listPairings = defineAction({
  name: "listPairings",
  description: "The target brands paired with a radar company.",
  kind: "read",
  input: z.object({ companyId: id }),
  output: z.object({ pairings: z.array(pairingSchema) }),
  async handler(input, db) {
    const rows = await db
      .select()
      .from(pairings)
      .where(eq(pairings.companyId, input.companyId))
      .orderBy(asc(pairings.brandName));
    return { pairings: rows };
  }
});

async function mustGetCompanyName(db: Executor, companyId: string) {
  const [row] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.id, companyId));
  if (!row) throw new ActionError("not_found", "Company not found");
  return row;
}

export const addPairing = defineAction({
  name: "addPairing",
  description:
    "Pair a target brand with a radar company, so contacts who work at the brand show up as warm paths.",
  kind: "write",
  input: z.object({
    companyId: id,
    brandName: z.string().trim().min(1, "Add the brand's name").max(200),
    brandDomain: z.string().trim().max(500).optional(),
    note
  }),
  output: pairingSchema.extend({ companyName: z.string() }),
  async handler(input, db) {
    const company = await mustGetCompanyName(db, input.companyId);
    const domain = input.brandDomain ? normalizeDomain(input.brandDomain) : null;
    if (input.brandDomain && !domain) {
      throw new ActionError("invalid", "That website doesn't look right, e.g. glossier.com");
    }
    const existing = await db
      .select({ name: pairings.brandName })
      .from(pairings)
      .where(eq(pairings.companyId, company.id));
    const wanted = normalizeName(input.brandName);
    if (existing.some((p) => normalizeName(p.name) === wanted)) {
      throw new ActionError(
        "conflict",
        `${input.brandName} is already paired with ${company.name}`
      );
    }
    const [row] = await db
      .insert(pairings)
      .values({
        companyId: company.id,
        brandName: input.brandName,
        brandDomain: domain,
        note: input.note || null
      })
      .returning();
    return { ...row, companyName: company.name };
  },
  log: (_input, r) => ({
    entityType: "company",
    entityId: r.companyId,
    summary: `Paired ${r.brandName} with ${r.companyName}`,
    data: { pairingId: r.id, brandDomain: r.brandDomain }
  })
});

export const removePairing = defineAction({
  name: "removePairing",
  description:
    "Remove a target brand from a radar company. Contacts linked by hand to that brand are unlinked too.",
  kind: "write",
  input: z.object({ pairingId: id }),
  output: pairingSchema.extend({ companyName: z.string() }),
  async handler(input, db) {
    const [row] = await db
      .select({ pairing: pairings, companyName: companies.name })
      .from(pairings)
      .innerJoin(companies, eq(pairings.companyId, companies.id))
      .where(eq(pairings.id, input.pairingId));
    if (!row) throw new ActionError("not_found", "That brand is no longer paired");
    await db.delete(pairings).where(eq(pairings.id, input.pairingId));
    return { ...row.pairing, companyName: row.companyName };
  },
  log: (_input, r) => ({
    entityType: "company",
    entityId: r.companyId,
    summary: `Removed ${r.brandName} from ${r.companyName}`,
    data: { pairingId: r.id }
  })
});

const linkResultSchema = z.object({
  linkId: z.string(),
  contactId: z.string(),
  contactName: z.string(),
  companyId: z.string(),
  target: z.string()
});

export const linkContact = defineAction({
  name: "linkContact",
  description:
    "Link a contact by hand to a radar company or to one of its target brands, with an optional note on how they connect.",
  kind: "write",
  input: z
    .object({
      contactId: id,
      companyId: id.optional(),
      pairingId: id.optional(),
      relation: z.enum(["works_at", "knows", "manual"]).default("manual"),
      note
    })
    .refine((v) => !!v.companyId !== !!v.pairingId, {
      message: "Link to either the company or one of its brands"
    }),
  output: linkResultSchema,
  async handler(input, db) {
    const [contact] = await db
      .select({ id: contacts.id, fullName: contacts.fullName })
      .from(contacts)
      .where(eq(contacts.id, input.contactId));
    if (!contact) throw new ActionError("not_found", "Contact not found");

    let companyId: string;
    let target: string;
    if (input.pairingId) {
      const [brand] = await db.select().from(pairings).where(eq(pairings.id, input.pairingId));
      if (!brand) throw new ActionError("not_found", "That brand is no longer paired");
      companyId = brand.companyId;
      target = brand.brandName;
    } else {
      const company = await mustGetCompanyName(db, input.companyId!);
      companyId = company.id;
      target = company.name;
    }

    const [dupe] = await db
      .select({ id: contactLinks.id })
      .from(contactLinks)
      .where(
        and(
          eq(contactLinks.contactId, contact.id),
          input.pairingId
            ? eq(contactLinks.pairingId, input.pairingId)
            : eq(contactLinks.companyId, companyId)
        )
      );
    if (dupe)
      throw new ActionError("conflict", `${contact.fullName} is already linked to ${target}`);

    const [link] = await db
      .insert(contactLinks)
      .values({
        contactId: contact.id,
        companyId: input.pairingId ? null : companyId,
        pairingId: input.pairingId ?? null,
        relation: input.relation,
        note: input.note || null
      })
      .returning();
    return {
      linkId: link.id,
      contactId: contact.id,
      contactName: contact.fullName,
      companyId,
      target
    };
  },
  log: (input, r) => ({
    entityType: "company",
    entityId: r.companyId,
    summary: `Linked ${r.contactName} to ${r.target}`,
    data: { linkId: r.linkId, contactId: r.contactId, note: input.note ?? null }
  })
});

export const unlinkContact = defineAction({
  name: "unlinkContact",
  description: "Remove a hand-made link between a contact and a radar company or target brand.",
  kind: "write",
  input: z.object({ linkId: id }),
  output: linkResultSchema,
  async handler(input, db) {
    const [row] = await db
      .select({
        link: contactLinks,
        contactName: contacts.fullName,
        companyName: companies.name,
        brand: pairings
      })
      .from(contactLinks)
      .innerJoin(contacts, eq(contactLinks.contactId, contacts.id))
      .leftJoin(pairings, eq(contactLinks.pairingId, pairings.id))
      .leftJoin(companies, eq(contactLinks.companyId, companies.id))
      .where(eq(contactLinks.id, input.linkId));
    if (!row) throw new ActionError("not_found", "That link was already removed");
    await db.delete(contactLinks).where(eq(contactLinks.id, input.linkId));
    return {
      linkId: row.link.id,
      contactId: row.link.contactId,
      contactName: row.contactName,
      companyId: row.brand ? row.brand.companyId : row.link.companyId!,
      target: row.brand ? row.brand.brandName : (row.companyName ?? "")
    };
  },
  log: (_input, r) => ({
    entityType: "company",
    entityId: r.companyId,
    summary: `Unlinked ${r.contactName} from ${r.target}`,
    data: { linkId: r.linkId, contactId: r.contactId }
  })
});

const CHUNK = 100;

export const importContacts = defineAction({
  name: "importContacts",
  description:
    "Import a LinkedIn Connections.csv. Creates or updates contacts keyed by profile URL (email when there is no URL); sector tags are kept.",
  kind: "write",
  input: z.object({ csv: z.string().min(1).max(5_000_000) }),
  output: z.object({ created: z.number(), updated: z.number(), skipped: z.number() }),
  async handler(input, db) {
    let parsed;
    try {
      parsed = parseConnectionsCsv(input.csv);
    } catch (e) {
      throw new ActionError("invalid", e instanceof Error ? e.message : "Could not read the file");
    }

    const existing = await db
      .select({ id: contacts.id, profileUrl: contacts.profileUrl, email: contacts.email })
      .from(contacts);
    const byUrl = new Map(existing.filter((c) => c.profileUrl).map((c) => [c.profileUrl!, c]));
    const byEmail = new Map(existing.filter((c) => c.email).map((c) => [c.email!, c]));

    let created = 0;
    let updated = 0;
    const withUrl: (typeof contacts.$inferInsert)[] = [];
    const emailOnly: (typeof contacts.$inferInsert)[] = [];
    const seen = new Set<string>();

    for (const row of parsed.rows) {
      const key = row.profileUrl ?? `email:${row.email}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const match =
        (row.profileUrl && byUrl.get(row.profileUrl)) || (row.email && byEmail.get(row.email));
      // An email already used by a different contact stays with that contact.
      const emailOwner = row.email ? byEmail.get(row.email) : undefined;
      const email = emailOwner && emailOwner !== match ? null : row.email;
      if (match) updated++;
      else created++;

      const values = { ...row, email, source: "linkedin_csv" as const };
      if (row.profileUrl) withUrl.push(values);
      else emailOnly.push(values);
    }

    // Refresh LinkedIn fields on re-import; sector tags are never overwritten.
    const refresh = {
      firstName: sql`excluded.first_name`,
      lastName: sql`excluded.last_name`,
      fullName: sql`excluded.full_name`,
      email: sql`coalesce(excluded.email, ${contacts.email})`,
      company: sql`excluded.company`,
      companyDomain: sql`coalesce(excluded.company_domain, ${contacts.companyDomain})`,
      position: sql`excluded.position`,
      connectedOn: sql`excluded.connected_on`,
      source: sql`excluded.source`,
      updatedAt: new Date()
    };
    for (let i = 0; i < withUrl.length; i += CHUNK) {
      await db
        .insert(contacts)
        .values(withUrl.slice(i, i + CHUNK))
        .onConflictDoUpdate({ target: contacts.profileUrl, set: refresh });
    }
    for (let i = 0; i < emailOnly.length; i += CHUNK) {
      await db
        .insert(contacts)
        .values(emailOnly.slice(i, i + CHUNK))
        .onConflictDoUpdate({ target: contacts.email, set: refresh });
    }
    return { created, updated, skipped: parsed.skipped };
  },
  log: (_input, r) => ({
    entityType: "contact",
    summary: `Imported LinkedIn connections: ${r.created} new, ${r.updated} updated${
      r.skipped ? `, ${r.skipped} skipped` : ""
    }`
  })
});

export const setContactSectors = defineAction({
  name: "setContactSectors",
  description: "Replace the sector tags on a contact.",
  kind: "write",
  input: z.object({
    contactId: id,
    sectors: z.array(z.string().trim().min(1).max(60)).max(20)
  }),
  output: contactSchema,
  async handler(input, db) {
    const [row] = await db
      .update(contacts)
      .set({ sectors: [...new Set(input.sectors)] })
      .where(eq(contacts.id, input.contactId))
      .returning();
    if (!row) throw new ActionError("not_found", "Contact not found");
    return row;
  },
  log: (input, contact) => ({
    entityType: "contact",
    entityId: contact.id,
    summary: input.sectors.length
      ? `Tagged ${contact.fullName}: ${input.sectors.join(", ")}`
      : `Cleared tags on ${contact.fullName}`
  })
});
