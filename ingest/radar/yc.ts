import { getJson, yearFrom, type RadarRecord, type RadarSource } from "./types";

const API = "https://yc-oss.github.io/api/tags";
export const YC_TAGS = [
  "advanced-materials",
  "synthetic-biology",
  "sustainable-fashion",
  "beauty",
  "cellular-agriculture",
  "climate"
];

type YcCompany = {
  id: number;
  name: string;
  slug: string;
  website?: string;
  one_liner?: string;
  long_description?: string;
  tags?: string[];
  industries?: string[];
  batch?: string;
  status?: string;
  url?: string;
};

export const yc: RadarSource = {
  slug: "yc",
  name: "Y Combinator",
  kind: "yc_tag",
  url: `${API}/<tag>.json`,
  async fetchRecords(fetchFn) {
    const lists = await Promise.all(
      YC_TAGS.map((tag) => getJson<YcCompany[]>(fetchFn, `${API}/${tag}.json`).then((r) => r.data))
    );
    // A company can appear under several tags; keep one record each.
    const byId = new Map<number, RadarRecord>();
    for (const c of lists.flat()) {
      if (c.status !== "Active" || byId.has(c.id)) continue;
      byId.set(c.id, {
        externalId: String(c.id),
        name: c.name,
        website: c.website || null,
        description: c.one_liner || c.long_description || null,
        stage: null,
        cohortYear: yearFrom(c.batch),
        tags: [...(c.tags ?? []), ...(c.industries ?? [])],
        raw: {
          id: c.id,
          slug: c.slug,
          batch: c.batch,
          url: c.url,
          longDescription: c.long_description
        }
      });
    }
    return [...byId.values()];
  }
};
