import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import type { Executor } from "@/db";
import { businessProfile } from "@/db/schema";
import {
  businessContext,
  changedFields,
  emptyProfile,
  FIELD_LABELS,
  PROFILE_FIELDS,
  profileFieldsSchema,
  waitingOn,
  type BusinessProfile,
  type ProfileField,
  type ProfileFields
} from "@/lib/business-profile";
import { defineAction } from "./define";

// The one row (one user, one business).
const ROW_ID = "main";

const profileSchema = profileFieldsSchema.extend({ updatedAt: z.date().nullable() });

export async function loadBusinessProfile(db: Executor): Promise<BusinessProfile> {
  const [row] = await db.select().from(businessProfile).where(eq(businessProfile.id, ROW_ID));
  if (!row) return { ...emptyProfile(), updatedAt: null };
  const fields = Object.fromEntries(PROFILE_FIELDS.map((f) => [f, row[f]])) as ProfileFields;
  return { ...fields, updatedAt: row.updatedAt };
}

// The summary the chat agent puts in its instructions, read straight from the database.
export async function loadBusinessContext(db: Executor) {
  return businessContext(await loadBusinessProfile(db));
}

export const getBusinessProfile = defineAction({
  name: "getBusinessProfile",
  description:
    "Cultured Matter's business profile, the single source of truth about the business: name, tagline, mission, story, founder, company details (entity, state, EIN, SAM UEI, address, founding date, team size, revenue stage, ownership), sectors, fit criteria, target brands, key people and partners, links and notes. Also returns a short plain-text summary (context) and the company details she has not given yet (waitingOn), so ask her for those instead of guessing.",
  kind: "read",
  input: z.object({}),
  output: z.object({
    profile: profileSchema,
    context: z.string(),
    waitingOn: z.array(z.string())
  }),
  async handler(_input, db) {
    const profile = await loadBusinessProfile(db);
    return {
      profile,
      context: businessContext(profile),
      waitingOn: waitingOn(profile).map((f) => FIELD_LABELS[f])
    };
  }
});

// Empty text is stored as null and lists are trimmed, so blank and "not answered" are one state.
function normalize(patch: Partial<ProfileFields>): Partial<ProfileFields> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = typeof v === "string" && v.trim() === "" ? null : v;
  }
  return out as Partial<ProfileFields>;
}

export const updateBusinessProfile = defineAction({
  name: "updateBusinessProfile",
  description:
    "Change fields of the business profile. Send only the fields to change; lists (sectors, fitCriteria, targetBrands, people, socialLinks) replace the whole list. An empty string clears a text field. Returns the profile and the names of the fields that changed.",
  kind: "write",
  input: profileFieldsSchema.partial(),
  output: z.object({ profile: profileSchema, changed: z.array(z.string()) }),
  async handler(input, db) {
    const before = await loadBusinessProfile(db);
    const patch = normalize(input);
    const changed = changedFields(before, patch);
    if (changed.length) {
      const values = Object.fromEntries(
        changed.map((f) => [f, patch[f]])
      ) as Partial<ProfileFields>;
      await db
        .insert(businessProfile)
        .values({ id: ROW_ID, ...values })
        .onConflictDoUpdate({
          target: businessProfile.id,
          set: { ...values, updatedAt: new Date() }
        });
    }
    return { profile: await loadBusinessProfile(db), changed };
  },
  // Field names only: the profile holds the EIN and SAM UEI, which never go in the log.
  log: (_input, result) => {
    const labels = (result.changed as ProfileField[]).map((f) => FIELD_LABELS[f] ?? f);
    return {
      entityType: "business_profile",
      entityId: ROW_ID,
      summary: labels.length
        ? `Updated the business profile: ${labels.join(", ")}`
        : "Saved the business profile (no changes)",
      data: { fields: result.changed }
    };
  }
});
