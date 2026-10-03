import { desc, eq } from "drizzle-orm";

import { ActionError } from "@/actions/define";
import type { Executor } from "@/db";
import { accounts, users } from "@/db/schema";
import { parseAllowedEmails } from "@/lib/allowed-emails";
import { GOOGLE_SCOPES } from "@/lib/google-scopes";

// Gmail API v1 and People API v1 over plain fetch with typed helpers. Permissions are granted on
// the Google sign-in (lib/auth.ts) or later through "Connect Google" (authClient.linkSocial).
export const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
export const PEOPLE_BASE = "https://people.googleapis.com/v1";
export { GOOGLE_SCOPES };

export function googleNotConnected() {
  return new ActionError(
    "google_not_connected",
    "Gmail isn't connected yet. Use Connect Google on the People page."
  );
}

// Better Auth stores the granted scopes comma or space separated.
export function missingGoogleScopes(scope: string | null | undefined): string[] {
  const granted = new Set(
    (scope ?? "")
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((s) => s.toLowerCase())
  );
  return GOOGLE_SCOPES.filter((s) => !granted.has(s.toLowerCase()));
}

// The Google account behind the app. Single-user app: the most recently used one.
export async function googleAccount(db: Executor) {
  const [row] = await db
    .select({ account: accounts, email: users.email })
    .from(accounts)
    .innerJoin(users, eq(accounts.userId, users.id))
    .where(eq(accounts.providerId, "google"))
    .orderBy(desc(accounts.updatedAt))
    .limit(1);
  return row ?? null;
}

// `mailbox` is the Gmail address (used in links); `me` holds her addresses, to tell her own
// messages from other people's.
export type GoogleSession = { token: string; mailbox: string; me: Set<string> };

// A valid access token (Better Auth refreshes it when it is about to expire) and her addresses.
export async function googleSession(db: Executor): Promise<GoogleSession> {
  const row = await googleAccount(db);
  if (!row || missingGoogleScopes(row.account.scope).length) throw googleNotConnected();
  const { auth } = await import("@/lib/auth");
  let token: string | undefined;
  try {
    ({ accessToken: token } = await auth.api.getAccessToken({
      body: { accountId: row.account.id, userId: row.account.userId }
    }));
  } catch {
    // Refresh token revoked or expired: connecting Google again fixes it.
    throw googleNotConnected();
  }
  if (!token) throw googleNotConnected();
  const signIn = row.email.toLowerCase();
  // Every address allowed to sign in is hers too, so none of them is ever imported as a person.
  const session: GoogleSession = {
    token,
    mailbox: signIn,
    me: new Set([signIn, ...parseAllowedEmails(process.env.ALLOWED_EMAILS)])
  };
  const profile = await gmail<{ emailAddress?: string | null }>(session, "/profile");
  const mailbox = profile?.emailAddress?.toLowerCase();
  if (mailbox?.includes("@")) {
    session.mailbox = mailbox;
    session.me.add(mailbox);
  }
  return session;
}

type Query = Record<string, string | number | boolean | string[] | undefined>;

// Repeated keys for arrays (metadataHeaders=From&metadataHeaders=To), as Google expects.
export function withQuery(url: string, query?: Query) {
  if (!query) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v]) qs.append(k, String(item));
  }
  const s = qs.toString();
  return s ? `${url}?${s}` : url;
}

async function google<T>(
  session: GoogleSession,
  url: string,
  init: { method?: "GET" | "POST"; body?: unknown; query?: Query; notFound?: "null" }
): Promise<T | null> {
  const res = await fetch(withQuery(url, init.query), {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${session.token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {})
    },
    body: init.body ? JSON.stringify(init.body) : undefined
  });
  if (res.status === 401 || res.status === 403) throw googleNotConnected();
  if (res.status === 404 && init.notFound === "null") return null;
  if (!res.ok) {
    throw new ActionError("unavailable", `Google didn't respond (error ${res.status}). Try again.`);
  }
  return (await res.json()) as T;
}

// Gmail call; `path` is relative to users/me.
export async function gmail<T>(
  session: GoogleSession,
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; query?: Query } = {}
): Promise<T> {
  return (await google<T>(session, `${GMAIL_BASE}${path}`, init)) as T;
}

// Same, but a missing item (deleted draft or thread) comes back as null.
export function gmailOptional<T>(session: GoogleSession, path: string, query?: Query) {
  return google<T>(session, `${GMAIL_BASE}${path}`, { query, notFound: "null" });
}

export async function people<T>(session: GoogleSession, path: string, query?: Query) {
  return (await google<T>(session, `${PEOPLE_BASE}${path}`, { query })) as T;
}

// Follows nextPageToken until `max` items or the last page. `key` names the list in the response.
export async function pageAll<T, K extends string>(
  fetchPage: (
    pageToken: string | undefined
  ) => Promise<{ [P in K]?: T[] } & { nextPageToken?: string }>,
  key: K,
  max: number
) {
  const items: T[] = [];
  let pageToken: string | undefined;
  do {
    const page = await fetchPage(pageToken);
    items.push(...((page[key] as T[] | undefined) ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken && items.length < max);
  return items.slice(0, max);
}

// Runs `fn` over `items` with at most `limit` in flight, keeping order. Gmail allows ~50
// message reads per second per user, so metadata fetches stay well under that.
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ---------------------------------------------------------------- Mail headers and drafts

export type Mailbox = { name: string | null; address: string };

// Parses an RFC 5322 address list ("Lena Fischer" <lena@x.com>, b@y.com). Commas inside quotes
// or angle brackets don't split.
export function parseAddressList(value: string | null | undefined): Mailbox[] {
  if (!value) return [];
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  let angle = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "\\" && quoted) {
      current += ch + (value[++i] ?? "");
      continue;
    }
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "<") angle++;
    else if (!quoted && ch === ">") angle = Math.max(0, angle - 1);
    if (ch === "," && !quoted && angle === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  parts.push(current);
  const out: Mailbox[] = [];
  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/^(.*)<([^<>]+)>\s*$/);
    const address = (m ? m[2] : p).trim().toLowerCase();
    if (!address.includes("@")) continue;
    const name = m
      ? m[1]
          .trim()
          .replace(/^"(.*)"$/, "$1")
          .replace(/\\(.)/g, "$1")
          .trim() || null
      : null;
    out.push({ name, address });
  }
  return out;
}

const base64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

// RFC 2047 encoded-word for header text that isn't plain ASCII.
function headerText(s: string) {
  const oneLine = s.replace(/[\r\n]+/g, " ");
  return /^[\x20-\x7e]*$/.test(oneLine) ? oneLine : `=?UTF-8?B?${base64(oneLine)}?=`;
}

function displayName(name: string) {
  const text = headerText(name);
  if (text.startsWith("=?")) return text;
  return `"${text.replace(/(["\\])/g, "\\$1")}"`;
}

// A plain-text RFC 2822 message, base64url encoded for users.drafts.create `message.raw`.
export function rawMessage(m: { to: string; toName?: string; subject: string; body: string }) {
  const to = m.toName?.trim() ? `${displayName(m.toName.trim())} <${m.to}>` : m.to;
  const body = (base64(m.body.replace(/\r?\n/g, "\r\n")).match(/.{1,76}/g) ?? []).join("\r\n");
  const message = [
    `To: ${to}`,
    `Subject: ${headerText(m.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    body
  ].join("\r\n");
  return Buffer.from(message, "utf8").toString("base64url");
}

// Links that open Gmail on her mailbox, whichever Google account is first in the browser.
export const gmailMessageLink = (mailbox: string, messageId: string) =>
  `https://mail.google.com/mail/u/${encodeURIComponent(mailbox)}/#all/${messageId}`;
export const gmailDraftLink = (mailbox: string, messageId: string) =>
  `https://mail.google.com/mail/u/${encodeURIComponent(mailbox)}/#drafts?compose=${messageId}`;
