import type { sources } from "@/db/schema";
import type { Fetch } from "@/ingest/radar/types";

export type { Fetch };

// One grant as a source reports it.
export type GrantRecord = {
  externalId: string;
  title: string;
  agency: string | null;
  amountMin: number | null;
  amountMax: number | null;
  // Null means rolling or not stated.
  deadline: Date | null;
  forProfitEligible: boolean;
  url: string | null;
  description: string | null;
  raw: unknown;
};

export type GrantSource = {
  slug: string;
  name: string;
  kind: (typeof sources.$inferInsert)["kind"];
  url: string;
  fetchRecords: (fetchFn: Fetch) => Promise<GrantRecord[]>;
};

// Deadlines are dates, not instants: pin them to noon UTC so they show as the
// same calendar day in any US time zone.
export function dateOnly(y: number, m: number, d: number): Date | null {
  if (!y || !m || !d) return null;
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return Number.isNaN(date.getTime()) ? null : date;
}

// "$1.5 million", "$250,000", "$30K" → numbers, in order of appearance.
export function parseAmounts(text: string | null | undefined): number[] {
  if (!text) return [];
  return [...text.matchAll(/\$\s?([\d,]+(?:\.\d+)?)\s*(million|m\b|billion|b\b|k\b|thousand)?/gi)]
    .map(([, n, unit]) => {
      const value = Number(n.replace(/,/g, ""));
      const u = unit?.toLowerCase();
      const scale = u?.startsWith("b")
        ? 1e9
        : u?.startsWith("m")
          ? 1e6
          : u === "k" || u === "thousand"
            ? 1e3
            : 1;
      return value * scale;
    })
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function amountRange(text: string | null | undefined): {
  min: number | null;
  max: number | null;
} {
  const nums = parseAmounts(text);
  if (nums.length === 0) return { min: null, max: null };
  if (nums.length === 1) return { min: null, max: nums[0] };
  return { min: Math.min(...nums), max: Math.max(...nums) };
}
