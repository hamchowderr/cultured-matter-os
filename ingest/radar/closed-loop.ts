import { decodeHTML } from "entities";

import { names, wpCollection, wpTerms } from "./wordpress";
import { stripHtml, type RadarRecord, type RadarSource } from "./types";

const SITE = "https://www.closedlooppartners.com/wp-json";

// The theme's own route carries the website and blurb; wp/v2 carries the fund and sector terms.
export type ClpPortfolio = {
  ID: number;
  post_title: string;
  post_name?: string;
  website_link?: string | null;
  modal_intro?: string | null;
  modal_content?: string | null;
};
export type ClpPortfolioTerms = {
  id: number;
  portfoliofund?: number[];
  portfoliosector?: number[];
  portfolioarea?: number[];
  portfolioother?: number[];
};
type Terms = Record<"fund" | "sector" | "area" | "other", Map<number, string>>;

// Venture investments are startups. Infrastructure loans go to cities and recycling facilities,
// and the Leadership and Beverage funds back established operators, so those are left out.
export function isStartup(funds: string[]): boolean {
  return (
    funds.includes("Venture") || (funds.length > 0 && funds.every((f) => f === "Circular Plastics"))
  );
}

const cleanUrl = (href: string | null | undefined) => {
  if (!href) return null;
  try {
    const url = new URL(decodeHTML(href));
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
};

// The first heading of the blurb is a one-line description.
const blurb = (html: string | null | undefined) =>
  (stripHtml(html?.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1]) || stripHtml(html)).slice(0, 400) ||
  null;

export function closedLoopRecords(
  portfolio: ClpPortfolio[],
  wpPosts: ClpPortfolioTerms[],
  terms: Terms
): RadarRecord[] {
  const termsById = new Map(wpPosts.map((p) => [p.id, p]));
  const out: RadarRecord[] = [];
  for (const p of portfolio) {
    const t = termsById.get(p.ID);
    const funds = names(t?.portfoliofund, terms.fund);
    if (!isStartup(funds)) continue;
    const sectors = names(t?.portfoliosector, terms.sector);
    const areas = names(t?.portfolioarea, terms.area);
    const other = names(t?.portfolioother, terms.other);
    out.push({
      externalId: String(p.ID),
      name: decodeHTML(p.post_title).trim(),
      website: cleanUrl(p.website_link),
      description: blurb(p.modal_content),
      stage: null,
      cohortYear: null,
      tags: [...sectors, ...areas, ...other, "circular economy"],
      raw: {
        id: p.ID,
        slug: p.post_name,
        funds,
        sectors,
        location: stripHtml(p.modal_intro).replace(/^Location:\s*/i, "") || null
      }
    });
  }
  return out;
}

export const closedLoop: RadarSource = {
  slug: "closed-loop",
  name: "Closed Loop Partners",
  kind: "wp_json",
  url: `${SITE}/clp/v2/portfolios`,
  async fetchRecords(fetchFn) {
    const [portfolio, wpPosts, fund, sector, area, other] = await Promise.all([
      wpCollection<ClpPortfolio>(fetchFn, `${SITE}/clp/v2/portfolios`),
      wpCollection<ClpPortfolioTerms>(
        fetchFn,
        `${SITE}/wp/v2/portfolio`,
        "_fields=id,portfoliofund,portfoliosector,portfolioarea,portfolioother"
      ),
      wpTerms(fetchFn, `${SITE}/wp/v2/portfoliofund`),
      wpTerms(fetchFn, `${SITE}/wp/v2/portfoliosector`),
      wpTerms(fetchFn, `${SITE}/wp/v2/portfolioarea`),
      wpTerms(fetchFn, `${SITE}/wp/v2/portfolioother`)
    ]);
    return closedLoopRecords(portfolio, wpPosts, { fund, sector, area, other });
  }
};
