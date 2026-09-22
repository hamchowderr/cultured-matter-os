// Dedupe keys shared by ingestion, People import and warm paths.

export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let value = input.trim().toLowerCase();
  if (!value) return null;
  if (!/^[a-z]+:\/\//.test(value)) value = `https://${value}`;
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

const COMPANY_SUFFIXES =
  /\b(inc|incorporated|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|gmbh|pbc|plc|sa|bv)\b\.?/g;

export function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(COMPANY_SUFFIXES, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
