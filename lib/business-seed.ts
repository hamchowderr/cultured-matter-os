import { loadBusinessProfile, updateBusinessProfile } from "@/actions/business";
import type { Database } from "@/db";
import { isEmptyValue, PROFILE_FIELDS, type ProfileFields } from "@/lib/business-profile";

// The first fill of the business profile, from what we already have:
// - her website (culturedmatter.com home page and the BuzzFeed series page),
// - the Cultured Matter OS PRD,
// - her May notes (the fit rubric, target brands and her three relevance tiers).
// Company details she hasn't given yet (entity, state, EIN, SAM UEI, address, founding date,
// team size, revenue, ownership) stay empty: the page asks her for them. Never guess these.
export const SEED_PROFILE: Partial<ProfileFields> = {
  name: "Cultured Matter",
  tagline: "A creative sustainability agency designed to shift culture.",
  mission:
    "Our mission is to rewrite the narrative around climate change by making sustainability visible, aspirational, and culturally contagious. The Cultured Matter ecosystem connects culture, brands, media, and environmental innovation to turn influence into measurable impact that shifts behavior, markets, systems, and industries.",
  story: [
    "Cultured Matter develops and executes creative sustainability projects through the lens of influence and innovation. Every project starts with the technical rigor of a serious sustainability practice and the imagination of a creative agency, and is designed so the whole sector picks it up: being the first to do something culturally bold is worth more than being the fifth to do it well.",
    "The approach pairs early-stage climate and materials technology that has no consumer use yet with a culturally influential brand. A limited-edition drop puts the innovation in front of consumers, media and culture amplify it, and the model is then open-sourced as a playbook so the entire industry can adopt it.",
    "The flagship project is a multi-episode sustainability series in development with BuzzFeed. It follows a bold, limited-edition collaboration between a brand, a cultural figure and an environmental innovator from concept through launch, impact and replication."
  ].join("\n\n"),
  founderName: "Simone Paz",
  founderBio: [
    "Founder and Creative Director Simone Paz has spent nearly a decade in sustainability across corporate and cultural sectors including beauty, the arts, the built environment, and education. She led the sustainability program within facilities for the Americas region of the global engineering firm Arup, and built the first sustainability program at a major U.S. contemporary art museum for The Museum of Contemporary Art, Los Angeles (MOCA). Her work sits at the intersection of culture and systems by joining technical sustainability with a clear understanding of how cultural influence drives behavior change at scale.",
    "Simone is an accredited LEED Green Associate through the U.S. Green Building Council, a TRUE Zero Waste Advisor, a Climate Reality Leader trained by Al Gore, a Global Green Eco-Ambassador, a UC Certified Victory Gardener, and holds a California state certification in Recycling and Resource Management. She received a Master of Science degree in Environmental Studies and a Bachelor of Arts degree in Art History."
  ].join("\n\n"),
  sectors: [
    "Beauty",
    "Fashion",
    "Travel and hotels",
    "Microplastics",
    "Built environment",
    "Music",
    "Packaging"
  ],
  fitCriteria: [
    "Extremely novel and visible",
    "Real environmental impact, backed by real data",
    "An obvious celebrity or media brand to pair it with",
    "Can be piloted as a limited-edition brand drop timed to the show",
    "We can be the first to do it; well-known companies score lower",
    "Carries a docuseries episode that consumers can take part in, such as a petition",
    "Sits in one of the focus sectors"
  ],
  targetBrands: ["Osea Malibu", "Rivian", "The RealReal"],
  people: [
    { name: "Simone Paz", role: "Founder and Creative Director" },
    { name: "BuzzFeed", role: "Media partner: the sustainability series in development" }
  ],
  website: "https://www.culturedmatter.com",
  notes: [
    "Based in Los Angeles. Contact: simone@culturedmatter.com.",
    "For-profit; Simone describes it as a social impact organization. The legal form is not confirmed yet.",
    "Relevance tiers for notes and research: 1 = directly relevant; 2 = not directly relevant but may hold ideas; 3 = references (frameworks, papers, PDFs).",
    "Tone: no negative messaging, shaming or calling out. Innovation and positive aspiration only; crises are framed as opportunities."
  ].join("\n")
};

// Fills only the fields that are still empty, so it is safe to run again and never overwrites
// anything she has edited. Returns the names of the fields it filled.
export async function seedBusinessProfile(db: Database, seed = SEED_PROFILE) {
  const current = await loadBusinessProfile(db);
  const patch: Partial<ProfileFields> = {};
  for (const f of PROFILE_FIELDS) {
    const value = seed[f];
    if (value === undefined || isEmptyValue(value) || !isEmptyValue(current[f])) continue;
    (patch as Record<string, unknown>)[f] = value;
  }
  if (Object.keys(patch).length === 0) return [];
  const { changed } = await updateBusinessProfile.run(patch, { db });
  return changed;
}
