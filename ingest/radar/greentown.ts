import { decodeHTML } from "entities";

import { names, wpCollection, wpTerms } from "./wordpress";
import { domainFromEmail, stripHtml, yearFrom, type RadarSource } from "./types";

const API = "https://greentownlabs.com/wp-json/wp/v2";

type GreentownMember = {
  id: number;
  title: { rendered: string };
  link: string;
  excerpt?: { rendered: string };
  industry?: number[];
  acf?: {
    member_subtitle?: string;
    member_type?: string;
    member_status?: string;
    member_date?: string;
    member_website?: string;
    member_email?: string;
  };
};

export const greentown: RadarSource = {
  slug: "greentown",
  name: "Greentown Labs",
  kind: "wp_json",
  url: `${API}/member`,
  async fetchRecords(fetchFn) {
    const [members, industry] = await Promise.all([
      wpCollection<GreentownMember>(
        fetchFn,
        `${API}/member`,
        "_fields=id,title,link,excerpt,industry,acf"
      ),
      wpTerms(fetchFn, `${API}/industry`)
    ]);

    return members
      .filter((m) => (m.acf?.member_type ?? "startup") === "startup")
      .map((m) => ({
        externalId: String(m.id),
        name: decodeHTML(m.title.rendered),
        website: m.acf?.member_website || null,
        emailDomain: domainFromEmail(m.acf?.member_email),
        description: stripHtml(m.excerpt?.rendered) || stripHtml(m.acf?.member_subtitle) || null,
        stage: null,
        cohortYear: yearFrom(m.acf?.member_date),
        tags: names(m.industry, industry),
        // Founder names, emails and socials are left out on purpose.
        raw: {
          id: m.id,
          link: m.link,
          status: m.acf?.member_status,
          memberDate: m.acf?.member_date,
          subtitle: m.acf?.member_subtitle
        }
      }));
  }
};
