import { decodeHTML } from "entities";

import { names, wpCollection, wpTerms } from "./wordpress";
import { stripHtml, yearFrom, type RadarRecord, type RadarSource } from "./types";

const API = "https://hmfoundation.com/wp-json/wp/v2";

export type GcaWinner = {
  id: number;
  date?: string;
  title: { rendered: string };
  link: string;
  excerpt?: { rendered: string };
  content?: { rendered: string };
  hmf_project_country?: number[];
  gca_winner_area?: number[];
  gca_winner_year?: number[];
};

type Terms = { country: Map<number, string>; area: Map<number, string>; year: Map<number, string> };

// Both page layouts put the link after a "Website" label.
export function winnerWebsite(html: string | undefined): string | null {
  const href = html?.match(
    /website[\s:]*(?:<\/strong>)?[\s:]*(?:&nbsp;|<br\s*\/?>|\s)*<a\s[^>]*?href="([^"]+)"/i
  )?.[1];
  if (!href) return null;
  try {
    const url = new URL(decodeHTML(href));
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

// Every winner is a fashion or textile innovation, which the tags say for categorizing.
export function gcaRecords(winners: GcaWinner[], terms: Terms): RadarRecord[] {
  return winners
    .filter((w) => !/\buniversity\b/i.test(w.title.rendered))
    .map((w) => {
      const areas = names(w.gca_winner_area, terms.area);
      const year = names(w.gca_winner_year, terms.year)[0];
      return {
        externalId: String(w.id),
        name: decodeHTML(w.title.rendered).trim(),
        website: winnerWebsite(w.content?.rendered),
        description: stripHtml(w.excerpt?.rendered) || null,
        stage: null,
        cohortYear: yearFrom(year) ?? yearFrom(w.date),
        tags: ["fashion", "textiles", ...areas],
        raw: {
          id: w.id,
          link: w.link,
          award: "H&M Foundation Global Change Award",
          year: year ?? null,
          countries: names(w.hmf_project_country, terms.country),
          areas
        }
      };
    });
}

export const gca: RadarSource = {
  slug: "gca",
  name: "H&M Foundation Global Change Award",
  kind: "wp_json",
  url: `${API}/gca_winner`,
  async fetchRecords(fetchFn) {
    const [winners, country, area, year] = await Promise.all([
      wpCollection<GcaWinner>(
        fetchFn,
        `${API}/gca_winner`,
        "_fields=id,date,title,link,excerpt,content,hmf_project_country,gca_winner_area,gca_winner_year"
      ),
      wpTerms(fetchFn, `${API}/hmf_project_country`),
      wpTerms(fetchFn, `${API}/gca_winner_area`),
      wpTerms(fetchFn, `${API}/gca_winner_year`)
    ]);
    return gcaRecords(winners, { country, area, year });
  }
};
