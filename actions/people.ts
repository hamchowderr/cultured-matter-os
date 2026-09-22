import { and, asc, eq, exists, inArray, like, or, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { companies, contactLinks, contacts, pairings } from "@/db/schema";
import { normalizeDomain, normalizeName } from "@/lib/normalize";
import { ActionError, defineAction } from "./define";
import { contactSchema, id, limit, type Contact } from "./schemas";

export const searchContacts = defineAction({
  name: "searchContacts",
  description: "Search contacts by name, company, position or sector tag.",
  kind: "read",
  input: z.object({
    query: z.string().trim().optional(),
    sector: z.string().optional(),
    limit
  }),
  output: z.object({ contacts: z.array(contactSchema) }),
  async handler(input, db) {
    const rows = await db
      .select()
      .from(contacts)
      .where(
        and(
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
        )
      )
      .orderBy(asc(contacts.fullName))
      .limit(input.limit);
    return { contacts: rows };
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
