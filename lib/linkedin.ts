import Papa from "papaparse";

import { domainFromEmail } from "@/ingest/radar/types";

export type LinkedInConnection = {
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  profileUrl: string | null;
  email: string | null;
  company: string | null;
  companyDomain: string | null;
  position: string | null;
  connectedOn: string | null;
};

// "https://www.linkedin.com/in/Jane-Doe-123/?trk=x" → "https://www.linkedin.com/in/jane-doe-123"
export function normalizeProfileUrl(url: string | null | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const path = u.pathname.replace(/\/+$/, "").toLowerCase();
    return path ? `https://www.linkedin.com${path}` : null;
  } catch {
    return null;
  }
}

const clean = (v: string | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

// "22 Sep 2026" → "2026-09-22"; anything else is kept as given.
function isoDate(v: string | null) {
  if (!v) return null;
  const d = new Date(`${v} 12:00 UTC`);
  return Number.isNaN(d.getTime()) ? v : d.toISOString().slice(0, 10);
}

// Parses LinkedIn's Connections.csv export. The file opens with a few "Notes:"
// lines before the real header row, and many rows have no email.
export function parseConnectionsCsv(text: string): { rows: LinkedInConnection[]; skipped: number } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const headerAt = lines.findIndex((l) => /^"?First Name"?\s*,/i.test(l));
  if (headerAt < 0) {
    throw new Error("This doesn’t look like a LinkedIn Connections.csv (no “First Name” header).");
  }
  const parsed = Papa.parse<Record<string, string>>(lines.slice(headerAt).join("\n"), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim()
  });

  let skipped = 0;
  const rows: LinkedInConnection[] = [];
  for (const r of parsed.data) {
    const firstName = clean(r["First Name"]);
    const lastName = clean(r["Last Name"]);
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const profileUrl = normalizeProfileUrl(r["URL"]);
    const email = clean(r["Email Address"])?.toLowerCase() ?? null;
    if (!fullName || (!profileUrl && !email)) {
      skipped++;
      continue;
    }
    rows.push({
      firstName,
      lastName,
      fullName,
      profileUrl,
      email,
      company: clean(r["Company"]),
      companyDomain: domainFromEmail(email),
      position: clean(r["Position"]),
      connectedOn: isoDate(clean(r["Connected On"]))
    });
  }
  return { rows, skipped };
}
