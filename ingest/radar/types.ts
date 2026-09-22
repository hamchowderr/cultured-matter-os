import { decodeHTML } from "entities";

import type { sources } from "@/db/schema";

// One company as a source reports it, before dedupe.
export type RadarRecord = {
  externalId: string;
  name: string;
  website?: string | null;
  // Fallback when a source has no website but lists a company email.
  emailDomain?: string | null;
  description?: string | null;
  stage?: string | null;
  cohortYear?: number | null;
  // The source's own tags; mapped to Simone's categories on upsert.
  tags: string[];
  raw: unknown;
};

export type Fetch = typeof fetch;

export type RadarSource = {
  slug: string;
  name: string;
  kind: (typeof sources.$inferInsert)["kind"];
  url: string;
  fetchRecords: (fetchFn: Fetch) => Promise<RadarRecord[]>;
};

export async function getJson<T>(
  fetchFn: Fetch,
  url: string
): Promise<{ data: T; headers: Headers }> {
  const res = await fetchFn(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url}`);
  return { data: (await res.json()) as T, headers: res.headers };
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return decodeHTML(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function yearFrom(text: string | null | undefined): number | null {
  const m = text?.match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

const FREE_MAIL =
  /^(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|aol|proton|protonmail)\./i;

export function domainFromEmail(email: string | null | undefined): string | null {
  const domain = email?.split("@")[1]?.trim().toLowerCase();
  if (!domain || FREE_MAIL.test(domain)) return null;
  return domain;
}
