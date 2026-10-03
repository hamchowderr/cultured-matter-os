import Firecrawl, { type Document, type ScrapeOptions } from "@mendable/firecrawl-js";
import { z } from "zod";

import { normalizeDomain, normalizeName } from "@/lib/normalize";
import type { RadarRecord, RadarSource } from "@/ingest/radar/types";
import type { Monitor } from "./pages";

// One scrape call. Tests pass a function that returns recorded responses.
export type Scrape = (url: string, options: ScrapeOptions) => Promise<Document>;

// JSON Schema handed to Firecrawl's JSON format; Firecrawl's LLM fills it from the page.
export const ENTRY_SCHEMA = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name of the company or project exactly as shown on the page."
          },
          website: {
            type: ["string", "null"],
            description:
              "The entry's own external website, only if the page links to it. Return null otherwise; never guess."
          },
          description: {
            type: ["string", "null"],
            description: "One-line description shown for the entry. Return null if none is shown."
          },
          year: {
            type: ["integer", "null"],
            description:
              "Cohort, award or grant year shown for the entry. Return null if not shown."
          },
          category: {
            type: ["string", "null"],
            description: "Sector, topic or stage label shown for the entry. Return null if none."
          }
        },
        required: ["name"]
      }
    }
  },
  required: ["entries"]
} as const;

export function scrapeOptions(monitor: Monitor): ScrapeOptions {
  return {
    formats: [{ type: "json", schema: ENTRY_SCHEMA, prompt: monitor.prompt }],
    onlyMainContent: true,
    // Reuse a copy up to 6 hours old; the default window is 2 days, too stale for a daily check.
    maxAge: 6 * 60 * 60 * 1000,
    timeout: 150_000
  };
}

const text = z
  .string()
  .nullish()
  .transform((s) => s?.trim() || null);
const Entry = z.object({
  name: z.string(),
  website: text.catch(null),
  description: text.catch(null),
  year: z.number().int().nullish().catch(null),
  category: text.catch(null)
});
const Extracted = z.object({ entries: z.array(z.unknown()) });

// Turns a Firecrawl document into Radar records. Throws when the page gave nothing,
// so a broken or blocked page is logged as a failed source instead of a silent zero.
export function toRecords(monitor: Monitor, doc: Document): RadarRecord[] {
  const status = doc.metadata?.statusCode;
  if (status && status >= 400) throw new Error(`${status} from ${monitor.url}`);
  const parsed = Extracted.safeParse(doc.json);
  if (!parsed.success) throw new Error(`No JSON entries extracted from ${monitor.url}`);

  const host = normalizeDomain(monitor.url);
  const byKey = new Map<string, RadarRecord>();
  for (const raw of parsed.data.entries) {
    const entry = Entry.safeParse(raw);
    if (!entry.success) continue;
    const { description, year, category } = entry.data;
    const name = entry.data.name.trim();
    const key = normalizeName(name);
    if (!key || byKey.has(key)) continue;

    // Keep only real external sites: links back to the monitored site are detail pages.
    const domain = normalizeDomain(entry.data.website);
    const website =
      domain && domain !== host && /^https?:\/\//i.test(entry.data.website ?? "")
        ? entry.data.website
        : null;

    const tags = [category, monitor.entryKind === "film" ? "Documentary" : null].filter(
      (t): t is string => !!t
    );
    byKey.set(key, {
      externalId: key,
      name,
      website,
      description,
      stage: null,
      cohortYear: year ?? null,
      tags,
      raw: { monitor: monitor.slug, page: monitor.url, entryKind: monitor.entryKind, ...entry.data }
    });
  }
  if (byKey.size === 0) throw new Error(`No entries extracted from ${monitor.url}`);
  return [...byKey.values()];
}

export function monitorSource(monitor: Monitor, scrape: Scrape): RadarSource {
  return {
    slug: monitor.slug,
    name: monitor.name,
    kind: "firecrawl",
    url: monitor.url,
    fetchRecords: async () => toRecords(monitor, await scrape(monitor.url, scrapeOptions(monitor)))
  };
}

// The live client. Reads FIRECRAWL_API_KEY. maxRetries counts attempts in this SDK and
// only a 502 is retried; Firecrawl charges nothing for a scrape that returns no document.
export function firecrawlScrape(apiKey = process.env.FIRECRAWL_API_KEY): Scrape {
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not set");
  const client = new Firecrawl({ apiKey, maxRetries: 2 });
  return (url, options) => client.scrape(url, options);
}
