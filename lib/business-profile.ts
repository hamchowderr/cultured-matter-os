import { z } from "zod/v4";

// The business profile (Settings → Business): what Cultured Matter is, in one place. The AI
// reads it as variables (businessContext below), and grant drafting will read the company
// details. Pure code only, so the form, the actions and the agent share it.

const text = z.string().trim().max(10_000);
const short = z.string().trim().max(300);
const list = z.array(z.string().trim().min(1).max(500)).max(100);

export const personSchema = z.object({
  name: z.string().trim().min(1).max(200),
  role: z.string().trim().max(300)
});

// Every editable field. Empty text is stored as null, so "not answered yet" is one state.
export const profileFieldsSchema = z.object({
  name: short.nullable(),
  tagline: short.nullable(),
  mission: text.nullable(),
  story: text.nullable(),
  founderName: short.nullable(),
  founderBio: text.nullable(),
  entityType: short.nullable(),
  entityState: short.nullable(),
  ein: short.nullable(),
  samUei: short.nullable(),
  address: short.nullable(),
  foundedOn: short.nullable(),
  teamSize: short.nullable(),
  revenueStage: short.nullable(),
  womanOwned: z.boolean().nullable(),
  minorityOwned: z.boolean().nullable(),
  sectors: list,
  fitCriteria: list,
  targetBrands: list,
  people: z.array(personSchema).max(100),
  website: short.nullable(),
  socialLinks: list,
  notes: text.nullable()
});

export type ProfileFields = z.infer<typeof profileFieldsSchema>;
export type ProfileField = keyof ProfileFields;
export type BusinessProfile = ProfileFields & { updatedAt: Date | null };

export const PROFILE_FIELDS = Object.keys(profileFieldsSchema.shape) as ProfileField[];

// Labels for the log ("Updated the business profile: mission, sectors") and the form.
export const FIELD_LABELS: Record<ProfileField, string> = {
  name: "name",
  tagline: "tagline",
  mission: "mission",
  story: "story",
  founderName: "founder name",
  founderBio: "founder bio",
  entityType: "legal entity type",
  entityState: "state",
  ein: "EIN",
  samUei: "SAM UEI",
  address: "business address",
  foundedOn: "founded date",
  teamSize: "team size",
  revenueStage: "revenue stage",
  womanOwned: "woman-owned",
  minorityOwned: "minority-owned",
  sectors: "sectors",
  fitCriteria: "fit criteria",
  targetBrands: "target brands",
  people: "key partners and people",
  website: "website",
  socialLinks: "social links",
  notes: "notes"
};

// Company details she still has to give. The page shows "Waiting for your answer" on these,
// and the agent can ask for them instead of guessing.
export const COMPANY_DETAIL_FIELDS = [
  "entityType",
  "entityState",
  "ein",
  "samUei",
  "address",
  "foundedOn",
  "teamSize",
  "revenueStage",
  "womanOwned",
  "minorityOwned"
] as const satisfies readonly ProfileField[];

export const emptyProfile = (): ProfileFields => ({
  name: null,
  tagline: null,
  mission: null,
  story: null,
  founderName: null,
  founderBio: null,
  entityType: null,
  entityState: null,
  ein: null,
  samUei: null,
  address: null,
  foundedOn: null,
  teamSize: null,
  revenueStage: null,
  womanOwned: null,
  minorityOwned: null,
  sectors: [],
  fitCriteria: [],
  targetBrands: [],
  people: [],
  website: null,
  socialLinks: [],
  notes: null
});

export function isEmptyValue(value: unknown) {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function waitingOn(profile: ProfileFields): ProfileField[] {
  return COMPANY_DETAIL_FIELDS.filter((f) => isEmptyValue(profile[f]));
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// The fields whose value differs between the stored profile and a patch. Names only.
export function changedFields(before: ProfileFields, patch: Partial<ProfileFields>) {
  return (Object.keys(patch) as ProfileField[]).filter(
    (f) => PROFILE_FIELDS.includes(f) && patch[f] !== undefined && !same(before[f], patch[f])
  );
}

// ------------------------------------------------------------------ AI context

export const BUSINESS_CONTEXT_MAX = 800;

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

// Cut at a sentence end (or a word) so the summary never stops mid-word.
function clip(s: string, max: number) {
  const t = oneLine(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sentence = cut.lastIndexOf(". ");
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1);
  const word = cut.lastIndexOf(" ");
  return (word > 0 ? cut.slice(0, word) : cut).replace(/[,;:]$/, "") + "…";
}

// A short plain-text summary the chat agent puts in its instructions on every message: name,
// what Cultured Matter does, mission, sectors and the top fit criteria. Always under
// BUSINESS_CONTEXT_MAX characters; anything that doesn't fit is left out, never cut mid-word.
export function businessContext(profile: Partial<ProfileFields>): string {
  const name = oneLine(profile.name ?? "") || "The business";
  const lines: string[] = [];

  const what = profile.tagline ? `${name}: ${clip(profile.tagline, 160)}` : name;
  lines.push(what.endsWith(".") ? what : `${what}.`);
  if (profile.founderName) lines.push(`Founder: ${oneLine(profile.founderName)}.`);
  if (profile.mission) lines.push(`Mission: ${clip(profile.mission, 260)}`);

  const sectors = profile.sectors ?? [];
  if (sectors.length) lines.push(`Sectors: ${sectors.map(oneLine).join(", ")}.`);

  const fixed = lines.join("\n");
  const criteria = profile.fitCriteria ?? [];
  let fit = "";
  for (const c of criteria.slice(0, 4)) {
    const next = `${fit ? `${fit}; ` : "Fit criteria: "}${oneLine(c)}`;
    if (fixed.length + 1 + next.length + 1 > BUSINESS_CONTEXT_MAX) break;
    fit = next;
  }
  const out = fit ? `${fixed}\n${fit}.` : fixed;
  return out.length <= BUSINESS_CONTEXT_MAX ? out : clip(out, BUSINESS_CONTEXT_MAX);
}
