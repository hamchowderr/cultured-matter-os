import { decodeHTML } from "entities";

import { normalizeName } from "@/lib/normalize";
import { categoriesOf, parseNewsFeed } from "./news-feed";
import { stripHtml, type RadarRecord, type RadarSource } from "./types";

const FEED = "https://www.third-derivative.org/portfolio/rss.xml";

// "Cohort 26-1" is the first 2026 cohort.
const COHORT = /^cohort\s+(\d{2})-\d+$/i;

// Third Derivative's portfolio feed lists the newest ten startups. The full list
// (about 310) comes from the monthly Firecrawl check (fc-third-derivative); this
// feed picks up additions in between. Items carry no company website, only a
// Third Derivative detail page, so they match the Firecrawl entries by name, and
// use the same externalId (the normalized name).
export const thirdDerivative: RadarSource = {
  slug: "third-derivative",
  name: "Third Derivative (RSS)",
  kind: "rss",
  url: FEED,
  async fetchRecords(fetchFn) {
    const res = await fetchFn(FEED, { headers: { Accept: "application/rss+xml" } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${FEED}`);

    const byKey = new Map<string, RadarRecord>();
    for (const item of parseNewsFeed(await res.text())) {
      const name = decodeHTML(String(item.title ?? "")).trim();
      const key = normalizeName(name);
      if (!key || byKey.has(key)) continue;

      const categories = categoriesOf(item);
      const cohort = categories.map((c) => c.match(COHORT)).find(Boolean);
      byKey.set(key, {
        externalId: key,
        name,
        website: null,
        description:
          stripHtml(item.description)
            .replace(/^problem focus\s*/i, "")
            .slice(0, 300) || null,
        stage: null,
        cohortYear: cohort ? 2000 + Number(cohort[1]) : null,
        tags: categories.filter((c) => !COHORT.test(c)),
        raw: {
          page: item.link ?? null,
          published: item.pubDate ?? null,
          categories
        }
      });
    }
    return [...byKey.values()];
  }
};
