import { getJson } from "@/ingest/radar/types";
import { amountRange, dateOnly, type GrantSource } from "./types";

// Portal categories that fit Cultured Matter; health-only or parks-only grants are skipped.
export const CA_CATEGORIES = [
  "Environment & Water",
  "Energy",
  "Agriculture",
  "Food & Nutrition",
  "Science, Technology, and Research & Development",
  "Transportation",
  "Housing, Community and Economic Development"
];

const RESOURCE = "111c8c88-21f6-453c-ae2c-b4785a0624f5";
const API = "https://data.ca.gov/api/3/action/datastore_search_sql";

type Row = {
  PortalID: string | number;
  Status: string;
  AgencyDept: string | null;
  Title: string;
  Purpose: string | null;
  Description: string | null;
  ApplicantType: string | null;
  Categories: string | null;
  EstAmounts: string | null;
  EstAvailFunds: string | null;
  ApplicationDeadline: string | null;
  GrantURL: string | null;
  AgencyURL: string | null;
  LastUpdated: string | null;
};

// "2026-11-04 23:59:00" → date; "Ongoing" and blanks → null (rolling).
const deadline = (s: string | null) => {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? dateOnly(+m[1], +m[2], +m[3]) : null;
};

export const caGrants: GrantSource = {
  slug: "ca-grants",
  name: "California Grants Portal",
  kind: "ca_grants",
  url: `https://data.ca.gov/dataset/california-grants-portal (resource ${RESOURCE})`,
  async fetchRecords(fetchFn) {
    const sql = `SELECT * FROM "${RESOURCE}" WHERE "Status" IN ('active', 'forecasted') AND "ApplicantType" ILIKE '%Business%'`;
    const { data } = await getJson<{
      success: boolean;
      result: { records: Row[] };
      error?: unknown;
    }>(fetchFn, `${API}?sql=${encodeURIComponent(sql)}`);
    if (!data.success)
      throw new Error(`data.ca.gov query failed: ${JSON.stringify(data.error).slice(0, 200)}`);

    return data.result.records
      .filter((r) => (r.Categories ?? "").split(/;\s*/).some((cat) => CA_CATEGORIES.includes(cat)))
      .map((r) => {
        const { min, max } = amountRange(r.EstAmounts ?? r.EstAvailFunds);
        return {
          externalId: String(r.PortalID),
          title: r.Title.trim(),
          agency: r.AgencyDept,
          amountMin: min,
          amountMax: max,
          deadline: deadline(r.ApplicationDeadline),
          forProfitEligible: true,
          url: r.GrantURL || r.AgencyURL || null,
          description:
            [r.Purpose, r.Description].filter(Boolean).join("\n\n").slice(0, 2000) || null,
          raw: {
            status: r.Status,
            applicantType: r.ApplicantType,
            categories: r.Categories,
            estAmounts: r.EstAmounts,
            estAvailFunds: r.EstAvailFunds,
            applicationDeadline: r.ApplicationDeadline,
            lastUpdated: r.LastUpdated
          }
        };
      });
  }
};
