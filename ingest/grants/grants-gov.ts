import { decodeHTML } from "entities";

import { stripHtml } from "@/ingest/radar/types";
import { MIN_REAL_AMOUNT } from "@/lib/format";
import { dateOnly, type Fetch, type GrantRecord, type GrantSource } from "./types";

const API = "https://api.grants.gov/v1/api";

// Saved searches. Single words: search2 treats a multi-word keyword as "any of these words".
export const GRANTS_GOV_KEYWORDS = [
  "recycling",
  "packaging",
  "biobased",
  "bioproducts",
  "textile",
  "circular",
  "sustainable",
  "climate",
  "compost",
  "waste"
];

// Environment, energy, agriculture, science & technology, natural resources, business & commerce.
const CATEGORIES = ["ENV", "EN", "AG", "ST", "NR", "BC"];

// Small businesses (23), other for-profits (22), unrestricted (99).
const FOR_PROFIT = ["22", "23", "99"];

type Hit = {
  id: string;
  number: string;
  title: string;
  agency: string;
  closeDate: string;
  oppStatus: string;
};

type Detail = {
  opportunityTitle?: string;
  synopsis?: {
    agencyName?: string;
    synopsisDesc?: string;
    responseDateStr?: string;
    awardCeiling?: string;
    awardFloor?: string;
    fundingDescLinkUrl?: string;
    applicantTypes?: { id: string }[];
  };
  forecast?: {
    forecastDesc?: string;
    estApplicationResponseDateStr?: string;
    applicantTypes?: { id: string }[];
  };
};

async function post<T>(fetchFn: Fetch, path: string, body: unknown): Promise<T> {
  const res = await fetchFn(`${API}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from Grants.gov ${path}`);
  const json = (await res.json()) as { errorcode: number; msg: string; data: T };
  if (json.errorcode !== 0) throw new Error(`Grants.gov ${path}: ${json.msg}`);
  return json.data;
}

// "2026-11-16-00-00-00" → date
const fromStr = (s: string | undefined) => {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? dateOnly(+m[1], +m[2], +m[3]) : null;
};
// "11/16/2026" → date
const fromUs = (s: string | undefined) => {
  const m = s?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? dateOnly(+m[3], +m[1], +m[2]) : null;
};
// Placeholder award figures such as "1" and "2" (common on Requests for Information) are dropped.
const money = (s: string | undefined) => {
  const n = Number(s);
  return s && Number.isFinite(n) && n >= MIN_REAL_AMOUNT ? n : null;
};

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

export const grantsGov: GrantSource = {
  slug: "grants-gov",
  name: "Grants.gov",
  kind: "grants_gov",
  url: `${API}/search2`,
  async fetchRecords(fetchFn) {
    const hits = new Map<string, Hit & { keywords: string[] }>();
    for (const keyword of GRANTS_GOV_KEYWORDS) {
      const data = await post<{ oppHits: Hit[] }>(fetchFn, "search2", {
        keyword,
        oppStatuses: "forecasted|posted",
        eligibilities: FOR_PROFIT.join("|"),
        fundingCategories: CATEGORIES.join("|"),
        rows: 100
      });
      for (const h of data.oppHits) {
        const seen = hits.get(h.id);
        if (seen) seen.keywords.push(keyword);
        else hits.set(h.id, { ...h, keywords: [keyword] });
      }
    }

    return mapLimit([...hits.values()], 6, async (hit): Promise<GrantRecord> => {
      const d = await post<Detail>(fetchFn, "fetchOpportunity", { opportunityId: Number(hit.id) });
      const syn = d.synopsis;
      const fc = d.forecast;
      const types = (syn?.applicantTypes ?? fc?.applicantTypes ?? []).map((t) => t.id);
      return {
        externalId: hit.id,
        title: decodeHTML(d.opportunityTitle ?? hit.title),
        // The detail agencyName sometimes holds a grants officer name; the search hit does not.
        agency: hit.agency || null,
        amountMin: money(syn?.awardFloor),
        amountMax: money(syn?.awardCeiling),
        deadline:
          fromStr(syn?.responseDateStr) ??
          fromStr(fc?.estApplicationResponseDateStr) ??
          fromUs(hit.closeDate),
        forProfitEligible: types.length ? types.some((t) => FOR_PROFIT.includes(t)) : true,
        url: `https://www.grants.gov/search-results-detail/${hit.id}`,
        description: stripHtml(syn?.synopsisDesc ?? fc?.forecastDesc).slice(0, 2000) || null,
        raw: {
          number: hit.number,
          status: hit.oppStatus,
          keywords: hit.keywords,
          applicantTypes: types,
          agencyLink: syn?.fundingDescLinkUrl ?? null,
          forecast: !syn && !!fc
        }
      };
    });
  }
};
