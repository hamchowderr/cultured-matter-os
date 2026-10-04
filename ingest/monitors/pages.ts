// Pages with no feed or API that Radar watches through Firecrawl JSON extraction.
// Each check costs 5 credits (1 scrape + 4 for the JSON format).

export type Monitor = {
  slug: string;
  name: string;
  url: string;
  // "film" entries are documentary projects, not companies; they are tagged so Radar can tell.
  entryKind: "company" | "film";
  prompt: string;
  // JSON Schema for this page. Defaults to ENTRY_SCHEMA (name, website, description,
  // year, category). Long lists ask for fewer fields so the extraction fits in the
  // model's maximum output length.
  schema?: Record<string, unknown>;
  // Days between checks. Defaults to CHECK_EVERY_DAYS.
  everyDays?: number;
};

const ALL = "Extract ALL of them. Do not skip any and do not invent entries.";

// Name and website only, for pages that list hundreds of entries.
export const NAME_WEBSITE_SCHEMA = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Company name exactly as shown on the page." },
          website: {
            type: ["string", "null"],
            description:
              "The company's own external website, only if the page links to it. Return null otherwise; never guess."
          }
        },
        required: ["name"]
      }
    }
  },
  required: ["entries"]
};

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
  },
  {
    slug: "fc-third-derivative",
    name: "Third Derivative",
    // About 310 startups on one page, with no pagination. The five-field schema made the
    // extraction exceed the model's maximum output length, so this page asks only for
    // name and website. The cards link to Third Derivative detail pages, not company
    // sites, and the sector labels are not in the page text. The portfolio RSS feed
    // (ingest/radar/third-derivative.ts) picks up new additions between checks.
    url: "https://www.third-derivative.org/portfolio",
    entryKind: "company",
    prompt: `List every startup in the portfolio on this page, by name. ${ALL}`,
    schema: NAME_WEBSITE_SCHEMA,
    everyDays: 30
  }
];

// How often a page is checked unless it sets everyDays, and how many pages one daily
// run may scrape. Two per run matches the free plan's two concurrent browsers and keeps
// the run well inside the 300-second function limit. Weekly checks of four pages plus a
// monthly Third Derivative check cost about 90 credits a month.
export const CHECK_EVERY_DAYS = 7;
export const MAX_PAGES_PER_RUN = 2;
