// Pages with no feed or API that Radar watches through Firecrawl JSON extraction.
// Each check costs 5 credits (1 scrape + 4 for the JSON format).

export type Monitor = {
  slug: string;
  name: string;
  url: string;
  // "film" entries are documentary projects, not companies; they are tagged so Radar can tell.
  entryKind: "company" | "film";
  prompt: string;
};

const ALL = "Extract ALL of them. Do not skip any and do not invent entries.";

export const MONITORS: Monitor[] = [
  {
    slug: "fc-fashion-for-good",
    name: "Fashion for Good",
    url: "https://www.fashionforgood.com/investment-hub/our-investments/",
    entryKind: "company",
    prompt: `List every company in the investment portfolio and the IPO & acquisitions list on this page. ${ALL}`
  },
  {
    slug: "fc-elemental-impact",
    name: "Elemental Impact",
    url: "https://elementalimpact.com/companies/",
    entryKind: "company",
    prompt: `List every portfolio company on this page. ${ALL}`
  },
  {
    slug: "fc-epa-sbir",
    name: "EPA SBIR",
    // Year-specific page: EPA publishes a new awardee page per award cycle.
    url: "https://www.epa.gov/sbir/2025-2026-small-business-innovation-research-sbir-phase-ii-awardees",
    entryKind: "company",
    prompt: `List every awardee company (the Institution column) in the awardee table, with the project title as the description. ${ALL}`
  },
  {
    slug: "fc-climate-story-fund",
    name: "Climate Story Fund (Doc Society)",
    url: "https://climatestoryunit.org/projects/",
    entryKind: "film",
    prompt: `List every project (film, series or podcast) on this page, with the year shown next to it. ${ALL}`
  }
];

// How often each page is checked, and how many pages one daily run may scrape.
// Two per run matches the free plan's two concurrent browsers and keeps the run
// well inside the 300-second function limit. Weekly checks of four pages cost
// about 20 credits a week; daily checks would cost 600 a month.
export const CHECK_EVERY_DAYS = 7;
export const MAX_PAGES_PER_RUN = 2;
