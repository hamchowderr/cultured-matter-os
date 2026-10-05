import { eq } from "drizzle-orm";

import { loadBusinessProfile, updateBusinessProfile } from "@/actions/business";
import type { Database } from "@/db";
import { businessProfile } from "@/db/schema";
import {
  isEmptyValue,
  PROFILE_FIELDS,
  type ProfileField,
  type ProfileFields
} from "@/lib/business-profile";

// The first fill of the business profile. Every value is quoted or closely taken from a source:
// - SITE_HOME: culturedmatter.com home page (cultured-matter-site/capture/content/index.md)
// - SITE_SERIES: culturedmatter.com/series, the BuzzFeed series page (capture/content/series.md)
// - PRD: "Cultured Matter OS" PRD in the vault
// - NOTES: her May notes, as summarised in the "Cultured Matter App Brainstorm" vault note
// Company details she hasn't given yet (entity, state, EIN, SAM UEI, address, founding date,
// team size, revenue, ownership) and her social links stay empty. Never guess these.
export const SEED_PROFILE: Partial<ProfileFields> = {
  // SITE_HOME, page title.
  name: "Cultured Matter",
  // SITE_HOME: "We're a creative sustainability agency designed to shift culture."
  tagline: "A creative sustainability agency designed to shift culture.",
  // SITE_SERIES, MISSION section, verbatim.
  mission:
    "Our mission is to rewrite the narrative around climate change by making sustainability visible, aspirational, and culturally contagious. The Cultured Matter ecosystem connects culture, brands, media, and environmental innovation to turn influence into measurable impact that shifts behavior, markets, systems, and industries.",
  story: [
    // SITE_HOME, verbatim.
    "Cultured Matter develops and executes creative sustainability projects through the lens of influence and innovation. We apply our unique methodology in every project to make the work dynamic, compelling, and culturally relevant. Each project is designed to accelerate environmental solutions across whole industries, and build pathways that shift culture, systems, and markets.",
    // PRD, opening paragraph.
    "Cultured Matter pairs early-stage climate and materials technology with culturally influential brands, told through a docuseries and open-source playbooks.",
    // SITE_SERIES, verbatim.
    "Cultured Matter is developing a multi-episode series with BuzzFeed that follows a bold, limited-edition sustainability collaboration from concept through launch, impact, and replication. A brand, cultural figure, and environmental innovator make the concept real, then we open-source the model so the entire sector can adopt and scale it."
  ].join("\n\n"),
  // SITE_HOME and SITE_SERIES.
  founderName: "Simone Paz",
  // SITE_SERIES, "About Simone", first paragraph, verbatim.
  founderBio:
    "Founder and Creative Director Simone Paz has spent nearly a decade in sustainability across corporate and cultural sectors including beauty, the arts, the built environment, and education. She led the sustainability program within facilities for the Americas region of the global engineering firm Arup, and built the first sustainability program at a major U.S. contemporary art museum for The Museum of Contemporary Art, Los Angeles (MOCA). Her work sits at the intersection of culture and systems by joining technical sustainability with a clear understanding of how cultural influence drives behavior change at scale.",
  // NOTES, fit rubric "Sector match: beauty, fashion, travel/hotels, microplastics, built
  // environment, music, packaging" (her notes p3, p6).
  sectors: [
    "Beauty",
    "Fashion",
    "Travel and hotels",
    "Microplastics",
    "Built environment",
    "Music",
    "Packaging"
  ],
  // NOTES, fit rubric rows, in her notes' order of emphasis.
  fitCriteria: [
    "Extremely novel and visible",
    "Real environmental impact, with real data",
    "An obvious celebrity or media brand to pair with",
    "Pilotable as a brand drop timed to the show",
    "We can be the first to do it; well-known companies score lower",
    "Carries a docuseries episode that consumers can take part in, such as a petition",
    "Matches a focus sector"
  ],
  // NOTES: "Osea Malibu, Rivian, The RealReal" (her notes p7-8).
  targetBrands: ["Osea Malibu", "Rivian", "The RealReal"],
  people: [
    // SITE_HOME: "Founder and Creative Director Simone Paz".
    { name: "Simone Paz", role: "Founder and Creative Director" },
    // SITE_SERIES: "a multi-episode series with BuzzFeed".
    { name: "BuzzFeed", role: "Multi-episode sustainability series in development" }
  ],
  // SITE_HOME, "Source: https://www.culturedmatter.com/".
  website: "https://www.culturedmatter.com",
  notes: [
    // SITE_SERIES footer: "CULTURED MATTER LOS ANGELES".
    "Based in Los Angeles.",
    // PRD: "a for-profit social impact organization"; NOTES and PRD open question on the legal form.
    "For-profit; Simone describes it as a social impact organization. The legal form is not confirmed yet.",
    // NOTES: her three-tier relevance system (p1).
    "Relevance tiers for notes and research: 1 = directly relevant; 2 = not directly relevant but may hold ideas; 3 = references (frameworks, papers, PDFs).",
    // SITE_SERIES, THE TONE.
    "Tone: no negative messaging anywhere. No shaming, badmouthing, or calling out environmental baddies. Innovation and positive aspiration only; the crises are reframed as opportunities for growth and change."
  ].join("\n")
};

const ROW_ID = "main";

async function seededFields(db: Database): Promise<string[]> {
  const [row] = await db
    .select({ seededFields: businessProfile.seededFields })
    .from(businessProfile)
    .where(eq(businessProfile.id, ROW_ID));
  return row?.seededFields ?? [];
}

// Each field is seeded at most once. A field the seed has never handled is filled when it is
// empty (and left alone when she has already written it); either way it is then marked as
// seeded, so a field she later clears on purpose stays cleared on every re-run. Returns the
// names of the fields it filled.
export async function seedBusinessProfile(db: Database, seed = SEED_PROFILE) {
  const done = new Set(await seededFields(db));
  const current = await loadBusinessProfile(db);
  const handled: ProfileField[] = [];
  const patch: Partial<ProfileFields> = {};
  for (const f of PROFILE_FIELDS) {
    const value = seed[f];
    if (value === undefined || isEmptyValue(value) || done.has(f)) continue;
    handled.push(f);
    if (isEmptyValue(current[f])) (patch as Record<string, unknown>)[f] = value;
  }
  if (handled.length === 0) return [];

  const filled = Object.keys(patch).length
    ? (await updateBusinessProfile.run(patch, { db })).changed
    : [];
  const marked = [...done, ...handled];
  await db
    .insert(businessProfile)
    .values({ id: ROW_ID, seededFields: marked })
    .onConflictDoUpdate({
      target: businessProfile.id,
      set: { seededFields: marked }
    });
  return filled;
}
