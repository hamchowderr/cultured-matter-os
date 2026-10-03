import { decodeHTML } from "entities";

import { categorize } from "@/lib/categories";
import { normalizeName } from "@/lib/normalize";
import { getJson, yearFrom, type RadarRecord, type RadarSource } from "./types";

const API = "https://api.nsf.gov/services/v1/awards.json";

// Single words: the API treats a multi-word keyword as "any of these words".
export const NSF_KEYWORDS = [
  "biomaterials",
  "biobased",
  "bioplastic",
  "biopolymer",
  "polymer",
  "recycling",
  "upcycling",
  "packaging",
  "textile",
  "fiber",
  "compostable",
  "biodegradable",
  "mycelium",
  "fermentation",
  "biomanufacturing",
  "circular",
  "dye",
  "cosmetic"
];
// Small business awards only. A spaced value like "SBIR Phase I" matches loosely, so query the bare program names.
const PROGRAMS = ["SBIR", "STTR"];
const YEARS_BACK = 3;
const PAGE = 25; // API maximum
const MAX_PER_QUERY = 200;

const FIELDS = [
  "id",
  "title",
  "awardeeName",
  "awardeeCity",
  "awardeeStateCode",
  "fundProgramName",
  "date",
  "startDate",
  "fundsObligatedAmt",
  "abstractText"
].join(",");

export type NsfAward = {
  id: string;
  title: string;
  awardeeName: string;
  awardeeCity?: string;
  awardeeStateCode?: string;
  fundProgramName?: string;
  date?: string;
  startDate?: string;
  fundsObligatedAmt?: string;
  abstractText?: string;
};

type Response = { response: { award?: NsfAward[]; metadata?: { totalCount?: number } } };

const LEGAL_SUFFIX =
  /[,\s]+(inc|incorporated|llc|l\.l\.c|ltd|corp|corporation|co|company|pbc)\.?$/i;
const SMALL = new Set(["a", "an", "and", "at", "for", "in", "of", "on", "the", "to"]);

// "RETURN TO VENDOR, CO" → "Return to Vendor". Mixed-case names are left as they are.
export function displayName(raw: string): string {
  let name = decodeHTML(raw).trim();
  while (LEGAL_SUFFIX.test(name)) name = name.replace(LEGAL_SUFFIX, "").trim();
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

// "SBIR Phase II: Dynamic Covalent Polymers …" → "Dynamic Covalent Polymers …"
const projectTitle = (title: string) =>
  decodeHTML(title)
    .replace(/^\s*(SBIR|STTR)[^:]*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

// Keeps small business awards whose project title fits a Radar category; the abstract is too
// broad to match on. Newest award first, one record per company.
export function nsfRecords(awards: NsfAward[]): RadarRecord[] {
  const sorted = [...awards].sort((a, b) => usDate(b.date) - usDate(a.date));
  const byName = new Map<string, RadarRecord>();
  for (const a of sorted) {
    if (!/^(SBIR|STTR)\b/i.test(a.fundProgramName ?? "") || !a.awardeeName) continue;
    const project = projectTitle(a.title);
    if (categorize(project).length === 0) continue;
    const name = displayName(a.awardeeName);
    const key = normalizeName(name);
    if (byName.has(key)) continue;
    byName.set(key, {
      // One sighting per company, refreshed with its latest award.
      externalId: key,
      name,
      website: null,
      description: project,
      stage: null,
      cohortYear: yearFrom(a.date),
      tags: a.fundProgramName ? [a.fundProgramName] : [],
      raw: {
        awardId: a.id,
        url: `https://www.nsf.gov/awardsearch/showAward?AWD_ID=${a.id}`,
        program: a.fundProgramName,
        awardee: a.awardeeName,
        location: [a.awardeeCity, a.awardeeStateCode].filter(Boolean).join(", ") || null,
        awardDate: a.date,
        amount: Number(a.fundsObligatedAmt) || null,
        abstract: a.abstractText?.slice(0, 1500) ?? null
      }
    });
  }
  return [...byName.values()];
}

// "08/24/2026" → epoch ms (0 when missing)
function usDate(s: string | undefined): number {
  const m = s?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? Date.UTC(+m[3], +m[1] - 1, +m[2]) : 0;
}

const mmddyyyy = (d: Date) =>
  `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;

export const nsf: RadarSource = {
  slug: "nsf-sbir",
  name: "NSF SBIR/STTR awards",
  kind: "nsf_awards",
  url: `${API}?fundProgramName=SBIR|STTR&keyword=<keyword>`,
  async fetchRecords(fetchFn) {
    const since = new Date();
    since.setUTCFullYear(since.getUTCFullYear() - YEARS_BACK);
    const awards = new Map<string, NsfAward>();
    for (const program of PROGRAMS) {
      for (const keyword of NSF_KEYWORDS) {
        for (let offset = 1; offset <= MAX_PER_QUERY; offset += PAGE) {
          const params = new URLSearchParams({
            keyword,
            fundProgramName: program,
            dateStart: mmddyyyy(since),
            printFields: FIELDS,
            rpp: String(PAGE),
            offset: String(offset)
          });
          const { data } = await getJson<Response>(fetchFn, `${API}?${params}`);
          const page = data.response.award ?? [];
          for (const a of page) awards.set(a.id, a);
          if (page.length < PAGE) break;
        }
      }
    }
    return nsfRecords([...awards.values()]);
  }
};
