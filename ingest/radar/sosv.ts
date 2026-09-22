import { decodeHTML } from "entities";

import { names, wpCollection, wpTerms } from "./wordpress";
import { stripHtml, yearFrom, type RadarSource } from "./types";

const API = "https://sosv.com/wp-json/wp/v2";

type SosvCompany = {
  id: number;
  title: { rendered: string };
  link: string;
  tx_category?: number[];
  tx_trend?: number[];
  tx_stage?: number[];
  tx_cohort?: number[];
  tx_program?: number[];
  acf?: {
    tagline?: string;
    website?: string;
    founded_year?: string;
    demo_day_description?: string;
    demo_day_tags?: string;
  };
};

export const sosv: RadarSource = {
  slug: "sosv",
  name: "SOSV",
  kind: "wp_json",
  url: `${API}/company`,
  async fetchRecords(fetchFn) {
    const [companies, category, trend, stage, cohort, program] = await Promise.all([
      wpCollection<SosvCompany>(
        fetchFn,
        `${API}/company`,
        "_fields=id,title,link,tx_category,tx_trend,tx_stage,tx_cohort,tx_program,acf"
      ),
      wpTerms(fetchFn, `${API}/tx_category`),
      wpTerms(fetchFn, `${API}/tx_trend`),
      wpTerms(fetchFn, `${API}/tx_stage`),
      wpTerms(fetchFn, `${API}/tx_cohort`),
      wpTerms(fetchFn, `${API}/tx_program`)
    ]);

    return companies.map((c) => {
      const cohorts = names(c.tx_cohort, cohort);
      const programs = names(c.tx_program, program);
      const demoTags = (c.acf?.demo_day_tags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      return {
        externalId: String(c.id),
        name: decodeHTML(c.title.rendered),
        website: c.acf?.website || null,
        description: stripHtml(c.acf?.tagline) || stripHtml(c.acf?.demo_day_description) || null,
        stage: names(c.tx_stage, stage)[0] ?? null,
        cohortYear: cohorts.map(yearFrom).find((y) => y != null) ?? null,
        tags: [...names(c.tx_category, category), ...names(c.tx_trend, trend), ...demoTags],
        raw: { id: c.id, link: c.link, cohorts, programs, acf: c.acf }
      };
    });
  }
};
