import { decodeHTML } from "entities";
import { XMLParser } from "fast-xml-parser";

import { normalizeName } from "@/lib/normalize";
import { stripHtml, type RadarRecord, type RadarSource } from "./types";

const FEED = "https://www.ctvc.co/rss/";

type Item = { title?: string; link?: string; pubDate?: string; "content:encoded"?: string };

// "Deals of the Week" → "VC / Growth" paragraphs look like:
// <p>⚡ <strong>Name</strong>, a City, ST-based what-they-do, <a>raised</a> <strong>$Xm</strong> in Series B funding from …</p>
export function parseDeals(
  html: string,
  issue: { link: string; date: string | null }
): RadarRecord[] {
  const start = html.search(/Deals of the Week/i);
  if (start < 0) return [];
  const rest = html.slice(start);
  const vcStart = rest.search(/<h3[^>]*>[\s\S]*?VC\s*\/\s*Growth/i);
  if (vcStart < 0) return [];
  const vc = rest.slice(vcStart);
  const end = vc.slice(5).search(/<h[23][\s>]/i);
  const section = end < 0 ? vc : vc.slice(0, end + 5);

  const records: RadarRecord[] = [];
  for (const [, p] of section.matchAll(/<p>([\s\S]*?)<\/p>/gi)) {
    const name = p.match(/<strong>([\s\S]*?)<\/strong>/i)?.[1];
    if (!name) continue;
    const text = stripHtml(p);
    const clean = decodeHTML(name).trim();
    const description =
      text.match(/-based (.+?), (?:raised|secured|closed|landed|received)\b/i)?.[1] ?? null;
    const stage = text.match(/\bin ([A-Za-z0-9+() -]+?) funding\b/i)?.[1]?.trim() ?? null;
    const amount = text.match(/\$\s?[\d.,]+\s?[mbk]\b/i)?.[0] ?? null;
    const location = text.match(/, an? (.+?)-based /i)?.[1] ?? null;
    records.push({
      externalId: normalizeName(clean),
      name: clean,
      website: null,
      description,
      stage: stage ? stage.replace(/\b\w/g, (c) => c.toUpperCase()) : null,
      cohortYear: null,
      tags: description ? [description] : [],
      raw: { issue: issue.link, issueDate: issue.date, location, amount, text }
    });
  }
  return records;
}

export const ctvc: RadarSource = {
  slug: "ctvc",
  name: "CTVC",
  kind: "rss",
  url: FEED,
  async fetchRecords(fetchFn) {
    const res = await fetchFn(FEED, { headers: { Accept: "application/rss+xml" } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${FEED}`);
    const xml = new XMLParser({ ignoreAttributes: true, cdataPropName: false }).parse(
      await res.text()
    );
    const raw = xml?.rss?.channel?.item ?? [];
    const items: Item[] = Array.isArray(raw) ? raw : [raw];

    // Newest issue first, so a company keeps its latest mention.
    const byName = new Map<string, RadarRecord>();
    for (const item of items) {
      const deals = parseDeals(item["content:encoded"] ?? "", {
        link: item.link ?? FEED,
        date: item.pubDate ?? null
      });
      for (const d of deals) if (!byName.has(d.externalId)) byName.set(d.externalId, d);
    }
    return [...byName.values()];
  }
};
