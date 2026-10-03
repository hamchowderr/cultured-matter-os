// Single-user app: only the addresses in ALLOWED_EMAILS (comma-separated) may sign in.
// An empty or missing list refuses everyone.

export function parseAllowedEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(
  email: string | null | undefined,
  raw: string | undefined = process.env.ALLOWED_EMAILS
): boolean {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  return parseAllowedEmails(raw).includes(normalized);
}

// Error code the OAuth callback appends to the sign-in page URL when an account is refused.
export const ACCOUNT_NOT_ALLOWED = "ACCOUNT_NOT_ALLOWED";
