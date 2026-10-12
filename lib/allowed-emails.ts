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

// Simone's address: the owner in production when OWNER_EMAIL isn't set.
export const DEFAULT_OWNER_EMAIL = "simone@simonepaz.com";

// The person the app belongs to (OWNER_EMAIL). Her Google account is the one Gmail, Contacts and
// the daily summary use, and she gets the summary, so another allowed account signing in to test
// never takes over her mailbox. Unset in production: DEFAULT_OWNER_EMAIL. Unset elsewhere (local
// development, previews): the earlier fallbacks apply.
export function ownerEmail(
  raw: string | undefined = process.env.OWNER_EMAIL,
  vercelEnv: string | undefined = process.env.VERCEL_ENV
): string | null {
  return raw?.trim().toLowerCase() || (vercelEnv === "production" ? DEFAULT_OWNER_EMAIL : null);
}

// Error code the OAuth callback appends to the sign-in page URL when an account is refused.
export const ACCOUNT_NOT_ALLOWED = "ACCOUNT_NOT_ALLOWED";
