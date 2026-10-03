import { and, count, eq, gt, isNotNull, isNull, max, or, sql } from "drizzle-orm";
import { z } from "zod/v4";

import type { Executor } from "@/db";
import { contacts } from "@/db/schema";
import { fluentConfig } from "@/lib/fluentcrm";
import { ActionError, defineAction } from "./define";
import { contactSchema, id } from "./schemas";

const email = z
  .email("That email doesn't look right")
  .trim()
  .max(320)
  .transform((e) => e.toLowerCase());

// Emails from the LinkedIn import keep their original case, so match case-insensitively.
async function contactByEmail(db: Executor, address: string) {
  const [row] = await db
    .select()
    .from(contacts)
    .where(sql`lower(${contacts.email}) = ${address}`)
    .limit(1);
  return row;
}

// Changed in the app since the last time FluentCRM was told.
const unsynced = or(
  isNull(contacts.newsletterSyncedAt),
  gt(contacts.newsletterChangedAt, contacts.newsletterSyncedAt)
);

export const setNewsletter = defineAction({
  name: "setNewsletter",
  description:
    "Add a contact to the newsletter list, or take them off it. FluentCRM is updated on the next sync.",
  kind: "write",
  input: z.object({ contactId: id, on: z.boolean() }),
  output: contactSchema,
  async handler(input, db) {
    const [current] = await db.select().from(contacts).where(eq(contacts.id, input.contactId));
    if (!current) throw new ActionError("not_found", "Contact not found");
    if (input.on && !current.email) {
      throw new ActionError(
        "invalid",
        `${current.fullName} has no email address, so they can't get the newsletter`
      );
    }
    if (current.newsletter === input.on) return current;
    const [row] = await db
      .update(contacts)
      .set({ newsletter: input.on, newsletterChangedAt: new Date() })
      .where(eq(contacts.id, input.contactId))
      .returning();
    return row;
  },
  log: (input, contact) => ({
    entityType: "contact",
    entityId: contact.id,
    summary: input.on
      ? `Added ${contact.fullName} to the newsletter`
      : `Took ${contact.fullName} off the newsletter`
  })
});

export const newsletterStatus = defineAction({
  name: "newsletterStatus",
  description:
    "Whether the newsletter is connected to FluentCRM, how many contacts are on it, and how many changes are waiting to sync.",
  kind: "read",
  input: z.object({}),
  output: z.object({
    connected: z.boolean(),
    subscribed: z.number(),
    waiting: z.number(),
    lastSyncedAt: z.date().nullable()
  }),
  async handler(_input, db) {
    const [[{ subscribed }], [{ waiting }], [{ last }]] = await Promise.all([
      db.select({ subscribed: count() }).from(contacts).where(eq(contacts.newsletter, true)),
      db
        .select({ waiting: count() })
        .from(contacts)
        .where(
          and(
            unsynced,
            or(
              and(eq(contacts.newsletter, true), isNotNull(contacts.email)),
              and(eq(contacts.newsletter, false), isNotNull(contacts.fluentcrmId))
            )
          )
        ),
      db.select({ last: max(contacts.newsletterSyncedAt) }).from(contacts)
    ]);
    return { connected: fluentConfig() !== null, subscribed, waiting, lastSyncedAt: last ?? null };
  }
});

const queueItem = z.object({
  contactId: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  fluentcrmId: z.number().nullable()
});

export const newsletterQueue = defineAction({
  name: "newsletterQueue",
  description:
    "Contacts whose newsletter change has not reached FluentCRM yet: ones to add to the list and ones to take off it.",
  kind: "read",
  input: z.object({}),
  output: z.object({ add: z.array(queueItem), remove: z.array(queueItem) }),
  async handler(_input, db) {
    const rows = await db
      .select()
      .from(contacts)
      .where(
        and(
          unsynced,
          isNotNull(contacts.email),
          or(eq(contacts.newsletter, true), isNotNull(contacts.fluentcrmId))
        )
      );
    const item = (c: (typeof rows)[number]) => ({
      contactId: c.id,
      email: c.email!,
      firstName: c.firstName,
      lastName: c.lastName,
      fluentcrmId: c.fluentcrmId
    });
    return {
      add: rows.filter((c) => c.newsletter).map(item),
      remove: rows.filter((c) => !c.newsletter).map(item)
    };
  }
});

const outcome = z.object({
  contactId: z.string(),
  // added: on the list. removed: off the list. blocked: FluentCRM says they unsubscribed,
  // bounced or complained, so the flag is cleared here. failed: try again next sync.
  result: z.enum(["added", "removed", "blocked", "failed"]),
  fluentcrmId: z.number().int().optional()
});

export const recordNewsletterSync = defineAction({
  name: "recordNewsletterSync",
  description: "Save what a newsletter sync with FluentCRM did for each contact.",
  kind: "write",
  input: z.object({
    // When the queue was read; a change made after this stays queued for the next sync.
    startedAt: z.date(),
    outcomes: z.array(outcome).max(5000)
  }),
  output: z.object({
    added: z.number(),
    removed: z.number(),
    blocked: z.number(),
    failed: z.number()
  }),
  async handler(input, db) {
    const counts = { added: 0, removed: 0, blocked: 0, failed: 0 };
    for (const o of input.outcomes) {
      counts[o.result]++;
      if (o.result === "failed") continue;
      const fluentcrmId = o.fluentcrmId ?? undefined;
      const set =
        o.result === "blocked"
          ? {
              newsletter: false,
              newsletterChangedAt: input.startedAt,
              newsletterSyncedAt: input.startedAt,
              fluentcrmId
            }
          : { newsletterSyncedAt: input.startedAt, fluentcrmId };
      await db.update(contacts).set(set).where(eq(contacts.id, o.contactId));
    }
    return counts;
  },
  log: (_input, r) => ({
    entityType: "contact",
    summary:
      `Synced the newsletter with FluentCRM: ${r.added} added, ${r.removed} removed` +
      (r.blocked ? `, ${r.blocked} had unsubscribed there` : "") +
      (r.failed ? `, ${r.failed} failed` : ""),
    data: r
  })
});

export const newsletterSignup = defineAction({
  name: "newsletterSignup",
  description:
    "Someone signed up for the newsletter (e.g. on the website): flag their contact, creating it if needed.",
  kind: "write",
  input: z.object({ email, name: z.string().trim().max(200).optional() }),
  output: z.object({
    contactId: z.string(),
    fullName: z.string(),
    created: z.boolean(),
    alreadyOn: z.boolean()
  }),
  async handler(input, db) {
    const existing = await contactByEmail(db, input.email);
    if (existing) {
      if (!existing.newsletter) {
        await db
          .update(contacts)
          .set({ newsletter: true, newsletterChangedAt: new Date() })
          .where(eq(contacts.id, existing.id));
      }
      return {
        contactId: existing.id,
        fullName: existing.fullName,
        created: false,
        alreadyOn: existing.newsletter
      };
    }
    const name = input.name || input.email.split("@")[0];
    const [first, ...rest] = name.split(/\s+/);
    const [row] = await db
      .insert(contacts)
      .values({
        fullName: name,
        firstName: input.name ? first : null,
        lastName: input.name && rest.length ? rest.join(" ") : null,
        email: input.email,
        source: "newsletter_signup",
        newsletter: true,
        newsletterChangedAt: new Date()
      })
      .returning();
    return { contactId: row.id, fullName: row.fullName, created: true, alreadyOn: false };
  },
  log: (_input, r) => ({
    entityType: "contact",
    entityId: r.contactId,
    summary: r.created
      ? `${r.fullName} signed up for the newsletter (new contact)`
      : `${r.fullName} signed up for the newsletter`
  })
});

export const newsletterUnsubscribe = defineAction({
  name: "newsletterUnsubscribe",
  description:
    "FluentCRM reported an unsubscribe: take the contact off the newsletter here too (no sync needed).",
  kind: "write",
  input: z
    .object({ email: email.optional(), fluentcrmId: z.number().int().positive().optional() })
    .refine((v) => v.email || v.fluentcrmId, { message: "Need an email or a FluentCRM id" }),
  output: z.object({
    contactId: z.string().nullable(),
    fullName: z.string().nullable(),
    changed: z.boolean()
  }),
  async handler(input, db) {
    let row = input.email ? await contactByEmail(db, input.email) : undefined;
    if (!row && input.fluentcrmId) {
      [row] = await db.select().from(contacts).where(eq(contacts.fluentcrmId, input.fluentcrmId));
    }
    if (!row) return { contactId: null, fullName: null, changed: false };
    if (!row.newsletter) return { contactId: row.id, fullName: row.fullName, changed: false };
    const now = new Date();
    await db
      .update(contacts)
      .set({
        newsletter: false,
        newsletterChangedAt: now,
        // FluentCRM already has this change, so there is nothing to sync.
        newsletterSyncedAt: now,
        fluentcrmId: row.fluentcrmId ?? input.fluentcrmId ?? null
      })
      .where(eq(contacts.id, row.id));
    return { contactId: row.id, fullName: row.fullName, changed: true };
  },
  log: (_input, r) => ({
    entityType: "contact",
    entityId: r.contactId,
    summary: r.changed
      ? `${r.fullName} unsubscribed from the newsletter`
      : r.contactId
        ? `${r.fullName} unsubscribed from the newsletter (already off)`
        : "Newsletter unsubscribe for someone not in People"
  })
});
