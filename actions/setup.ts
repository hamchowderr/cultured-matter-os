import { and, count, eq, max, sql } from "drizzle-orm";
import { z } from "zod/v4";

import type { Database } from "@/db";
import { activityLog, contacts } from "@/db/schema";
import { defineAction } from "./define";
import { newsletterStatus } from "./newsletter";
import { googleStatus } from "./gmail";

export const SETUP_STEPS = ["linkedin", "google", "iphone", "newsletter"] as const;

export const setupStatusSchema = z.object({
  linkedin: z.object({ done: z.boolean(), contacts: z.number() }),
  google: z.object({ done: z.boolean() }),
  iphone: z.object({ done: z.boolean(), lastCaptureAt: z.date().nullable() }),
  newsletter: z.object({ done: z.boolean() }),
  done: z.number(),
  total: z.number()
});
export type SetupStatus = z.infer<typeof setupStatusSchema>;

export const setupStatus = defineAction({
  name: "setupStatus",
  description:
    "What is set up so far: LinkedIn contacts imported, Google (Gmail and Contacts) connected, iPhone Shortcuts used, and the newsletter connected to FluentCRM.",
  kind: "read",
  input: z.object({}),
  output: setupStatusSchema,
  async handler(_input, db) {
    // Read actions never run inside a transaction, so this executor is the database itself.
    const ctx = { db: db as Database };
    const [[linkedin], [iphone], google, newsletter] = await Promise.all([
      db.select({ n: count() }).from(contacts).where(eq(contacts.source, "linkedin_csv")),
      // createCapture records where a capture came from in its activity entry.
      db
        .select({ last: max(activityLog.at) })
        .from(activityLog)
        .where(
          and(
            eq(activityLog.action, "createCapture"),
            sql`json_extract(${activityLog.data}, '$.source') = 'iphone'`
          )
        ),
      googleStatus.run({}, ctx),
      newsletterStatus.run({}, ctx)
    ]);
    const steps = {
      linkedin: { done: linkedin.n > 0, contacts: linkedin.n },
      google: { done: google.connected },
      iphone: { done: iphone.last != null, lastCaptureAt: iphone.last ?? null },
      newsletter: { done: newsletter.connected }
    };
    return {
      ...steps,
      done: SETUP_STEPS.filter((s) => steps[s].done).length,
      total: SETUP_STEPS.length
    };
  }
});
