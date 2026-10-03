import { categoriesOf, newsRecords, parseNewsFeed } from "./news-feed";
import type { RadarSource } from "./types";

const FEED = "https://agfundernews.com/feed";

// AgFunderNews tags startup coverage "Startups & funding"; everything else is skipped.
// See news-feed.ts for when an article becomes a company.
export const agfundernews: RadarSource = {
  slug: "agfundernews",
  name: "AgFunderNews",
  kind: "rss",
  url: FEED,
  async fetchRecords(fetchFn) {
    const res = await fetchFn(FEED, { headers: { Accept: "application/rss+xml" } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${FEED}`);
    return newsRecords(parseNewsFeed(await res.text()), "agfundernews.com", (item) => {
      const categories = categoriesOf(item);
      return (
        categories.some((c) => /^startups? (&|and) funding$/i.test(c)) &&
        // Investor interviews and opinion pieces name concepts and funds, not portfolio startups.
        !categories.some((c) => /^(investor q&a|opinion|guest article)$/i.test(c))
      );
    });
  }
};
