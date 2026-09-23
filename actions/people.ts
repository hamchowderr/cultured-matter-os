import { and, asc, count, eq, exists, inArray, like, or, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { companies, contactLinks, contacts, pairings } from "@/db/schema";
import { normalizeDomain, normalizeName } from "@/lib/normalize";
import { ActionError, defineAction } from "./define";
import { parseConnectionsCsv } from "@/lib/linkedin";
import { contactSchema, id, limit, offset, type Contact } from "./schemas";

export const searchContacts = defineAction({
  name: "searchContacts",
  description: "Search contacts by name, company, position or sector tag.",
  kind: "read",
  input: z.object({
    query: z.string().trim().optional(),
    sector: z.string().optional(),
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
        : undefined
    );
    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(contacts)
        .where(where)
        .orderBy(asc(contacts.fullName))
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
  note: z.string().nullable()
});

export const findWarmPath = defineAction({
  name: "findWarmPath",
  description:
    "List contacts who can reach a radar company: they work at it or at a brand paired with it (matched by domain or name), or were linked to it by hand.",
  kind: "read",
  input: z.object({ companyId: id }),
  output: z.object({ paths: z.array(warmPathSchema) }),
  async handler(input, db) {
    const [company] = await db.select().from(companies).where(eq(companies.id, input.companyId));
    if (!company) throw new ActionError("not_found", "Company not found");
    const brands = await db.select().from(pairings).where(eq(pairings.companyId, company.id));

    const targets = [
      { via: "company" as const, name: company.name, domain: company.domain },
      ...brands.map((b) => ({
        via: "brand" as const,
        name: b.brandName,
        domain: normalizeDomain(b.brandDomain)
      }))
    ];
    const domains = targets.map((t) => t.domain).filter((d): d is string => !!d);

    const candidates = await db
      .select()
      .from(contacts)
      .where(
        or(
          domains.length ? inArray(contacts.companyDomain, domains) : undefined,
          ...targets.map((t) => like(contacts.company, `%${t.name}%`))
        )
      );

    const paths: z.input<typeof warmPathSchema>[] = [];
    const seen = new Set<string>();
    const add = (p: (typeof paths)[number]) => {
      const key = `${p.contact.id}:${p.target}`;
      if (!seen.has(key)) {
        seen.add(key);
        paths.push(p);
      }
    };

    for (const t of targets) {
      const name = normalizeName(t.name);
      for (const c of candidates) {
        const byDomain = !!t.domain && c.companyDomain === t.domain;
        const byName = !!c.company && normalizeName(c.company) === name;
        if (byDomain || byName) {
          add({
            contact: c as Contact,
            via: t.via,
            target: t.name,
            reason: "works_at",
            note: null
          });
        }
      }
    }

    const brandIds = brands.map((b) => b.id);
    const links = await db
      .select({ link: contactLinks, contact: contacts, brand: pairings })
      .from(contactLinks)
      .innerJoin(contacts, eq(contactLinks.contactId, contacts.id))
      .leftJoin(pairings, eq(contactLinks.pairingId, pairings.id))
      .where(
        or(
          eq(contactLinks.companyId, company.id),
          brandIds.length ? inArray(contactLinks.pairingId, brandIds) : undefined
        )
      );
    for (const { link, contact, brand } of links) {
      add({
        contact: contact as Contact,
        via: brand ? "brand" : "company",
        target: brand ? brand.brandName : company.name,
        reason: "linked",
        note: link.note
      });
    }

    return { paths };
  }
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
