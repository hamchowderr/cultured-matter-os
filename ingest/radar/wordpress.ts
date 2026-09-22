import { decodeHTML } from "entities";

import { getJson, type Fetch } from "./types";

// Pages through a WordPress REST collection (max 100 per page).
export async function wpCollection<T>(fetchFn: Fetch, base: string, query = ""): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const { data, headers } = await getJson<T[]>(
      fetchFn,
      `${base}?per_page=100&page=${page}${query ? `&${query}` : ""}`
    );
    out.push(...data);
    const totalPages = Number(headers.get("x-wp-totalpages") ?? 1);
    if (page >= totalPages || data.length === 0) return out;
  }
}

// Term id → name for a taxonomy.
export async function wpTerms(fetchFn: Fetch, base: string): Promise<Map<number, string>> {
  const terms = await wpCollection<{ id: number; name: string }>(fetchFn, base, "_fields=id,name");
  return new Map(terms.map((t) => [t.id, decodeHTML(t.name)]));
}

export const names = (ids: number[] | undefined, terms: Map<number, string>) =>
  (ids ?? []).map((id) => terms.get(id)).filter((n): n is string => !!n);
