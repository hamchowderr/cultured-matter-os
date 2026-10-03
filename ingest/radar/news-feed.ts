import { decodeHTML } from "entities";
import { XMLParser } from "fast-xml-parser";

import { normalizeDomain } from "@/lib/normalize";
import { stripHtml, type RadarRecord } from "./types";

// News feeds are articles, not company lists. An item becomes a company only when:
//   1. the feed marks it as startup news (each feed says how), and
//   2. the article links a company's home page (a site root, not a deep link), and
//   3. that link's text is a name that also appears in the headline.
// Anything else — roundups, opinion, corporates mentioned in passing — is skipped.

export type NewsItem = {
  title?: string;
  link?: string;
  pubDate?: string;
  description?: string;
  category?: string | string[];
  "content:encoded"?: string;
};

// Links that are never a startup's own site.
const NOT_A_COMPANY =
  /(^|\.)(twitter|x|linkedin|facebook|instagram|youtube|youtu|tiktok|medium|substack|wikipedia|google|apple|amazon|crunchbase|pitchbook|bit|t|lnkd|reuters|bloomberg|techcrunch|sec|gov)\.[a-z.]+$/i;
// Investors are named in funding headlines too; they are not radar companies.
const INVESTOR = /\b(vc|ventures?|capital|fund|partners|investments?|holdings)\b/i;
// A home page: "/", or a locale or index segment.
const HOME_PATH = /^\/((en|[a-z]{2}([-_][a-z]{2})?|home|index\.html?)\/?)?$/i;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function parseNewsFeed(xml: string): NewsItem[] {
  const doc = new XMLParser({ ignoreAttributes: true, cdataPropName: false }).parse(xml);
  const raw = doc?.rss?.channel?.item ?? [];
  return Array.isArray(raw) ? raw : [raw];
}

export const categoriesOf = (item: NewsItem) =>
  (Array.isArray(item.category) ? item.category : item.category ? [item.category] : []).map((c) =>
    decodeHTML(String(c)).trim()
  );

// The company the headline is about, if the article links its home page.
export function headlineCompany(
  item: NewsItem,
  feedHost: string
): { name: string; website: string } | null {
  const title = decodeHTML(item.title ?? "");
  const html = item["content:encoded"] ?? "";
  let best: { name: string; website: string; at: number } | null = null;

  for (const [, href, inner] of html.matchAll(/<a\s[^>]*?href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const name = stripHtml(inner);
    if (name.length < 2 || name.length > 60 || INVESTOR.test(name)) continue;
    const at = title.search(
      new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(name)}($|[^\\p{L}\\p{N}])`, "iu")
    );
    if (at < 0) continue;

    let url: URL;
    try {
      url = new URL(decodeHTML(href));
    } catch {
      continue;
    }
    const host = normalizeDomain(url.hostname);
    if (!/^https?:$/.test(url.protocol) || !host) continue;
    if (host === feedHost || host.endsWith(`.${feedHost}`) || NOT_A_COMPANY.test(host)) continue;
    if (!HOME_PATH.test(url.pathname)) continue;

    if (!best || at < best.at) best = { name, website: `${url.protocol}//${url.host}/`, at };
  }
  return best && { name: best.name, website: best.website };
}

// Newest item first, so a company keeps its latest mention.
export function newsRecords(
  items: NewsItem[],
  feedHost: string,
  isStartupNews: (item: NewsItem) => boolean
): RadarRecord[] {
  const byDomain = new Map<string, RadarRecord>();
  for (const item of items) {
    if (!isStartupNews(item)) continue;
    const company = headlineCompany(item, feedHost);
    const domain = company && normalizeDomain(company.website);
    if (!company || !domain || byDomain.has(domain)) continue;
    const categories = categoriesOf(item);
    byDomain.set(domain, {
      externalId: domain,
      name: company.name,
      website: company.website,
      description:
        stripHtml(item.description)
          .replace(/\s*The post .+ appeared first on .+$/i, "")
          .slice(0, 300) || null,
      stage: null,
      cohortYear: null,
      tags: categories,
      raw: {
        article: item.link ?? null,
        headline: decodeHTML(item.title ?? ""),
        published: item.pubDate ?? null,
        categories
      }
    });
  }
  return [...byDomain.values()];
}
