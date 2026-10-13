import { randomUUID } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import { ActionError } from "@/actions/define";
import type { Executor } from "@/db";
import { accounts, users } from "@/db/schema";
import { ownerEmail, parseAllowedEmails } from "@/lib/allowed-emails";
import { GOOGLE_SCOPES } from "@/lib/google-scopes";

// Gmail API v1 and People API v1 over plain fetch with typed helpers. Permissions are granted on
// the Google sign-in (lib/auth.ts) or later through "Sync Google" (authClient.linkSocial).
export const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
export const PEOPLE_BASE = "https://people.googleapis.com/v1";
export { GOOGLE_SCOPES };

export function googleNotConnected() {
  return new ActionError(
    "google_not_connected",
    "Gmail isn't connected yet. Use Sync Google on the People page."
  );
}

// Google asked us to slow down and kept asking through every retry. Nothing is wrong with the
// connection; trying again a little later works.
export function googleRateLimited() {
  return new ActionError(
    "rate_limited",
    "Gmail asked us to slow down. Try again in a minute; nothing needs reconnecting."
  );
}

// ---------------------------------------------------------------- Quota and errors

// Gmail's quota: 6,000 units a minute per user, and each method costs units
// (developers.google.com/workspace/gmail/api/reference/quota). Calls are paced under
// GMAIL_UNITS_PER_MINUTE, a margin below the limit, so a sync never runs into it however
// many messages it reads. People API calls have their own quota and are not paced.
export const GMAIL_UNITS_PER_MINUTE = 5_000;

const GMAIL_COSTS: [RegExp, number][] = [
  [/^\/profile$/, 1],
  [/^\/messages$/, 5],
  [/^\/messages\/[^/]+$/, 20],
  [/^\/threads\/[^/]+$/, 40],
  [/^\/drafts$/, 10]
];

// The quota units one Gmail call costs; unknown calls count as the dearest read.
export function gmailUnits(path: string) {
  return GMAIL_COSTS.find(([re]) => re.test(path))?.[1] ?? 40;
}

// Clock and randomness, swapped in tests so backoff and pacing run without waiting.
export const googleTiming = {
  now: () => Date.now(),
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  random: () => Math.random()
};

// Spaces calls evenly so their units never exceed `unitsPerMinute`: each call reserves the
// time its units take at that rate, and waits until its slot comes.
export class GmailPacer {
  private next = 0;
  constructor(private unitsPerMinute = GMAIL_UNITS_PER_MINUTE) {}
  async take(units: number) {
    const now = googleTiming.now();
    const start = Math.max(now, this.next);
    this.next = start + (units * 60_000) / this.unitsPerMinute;
    if (start > now) await googleTiming.sleep(start - now);
  }
}

// One pacer per Google account, shared by every sync, draft and reply check in this process.
const pacers = new Map<string, GmailPacer>();
function pacerFor(accountId: string) {
  let pacer = pacers.get(accountId);
  if (!pacer) pacers.set(accountId, (pacer = new GmailPacer()));
  return pacer;
}

type GoogleErrorBody = {
  error?: {
    status?: string;
    message?: string;
    errors?: { reason?: string; domain?: string }[];
    details?: { "@type"?: string; reason?: string; domain?: string }[];
  };
};

export type GoogleFailure = "auth" | "rate" | "daily" | "server" | "other";

// What a failed Google response means (developers.google.com/workspace/gmail/api/guides/
// handle-errors). 401 is the token. 403 is either a usage limit (rateLimitExceeded,
// userRateLimitExceeded, quota exceeded: retry later) or a permission (insufficient scopes,
// a domain policy: connecting again is the fix). 429 is too many requests. 5xx is Google's.
export function classifyGoogleError(status: number, body: GoogleErrorBody | null): GoogleFailure {
  if (status === 401) return "auth";
  if (status === 429) return "rate";
  if (status >= 500) return "server";
  if (status !== 403) return "other";
  const e = body?.error;
  const reasons = [
    ...(e?.errors ?? []).map((x) => x.reason),
    ...(e?.details ?? []).map((x) => x.reason)
  ].filter((r): r is string => !!r);
  if (reasons.includes("dailyLimitExceeded")) return "daily";
  if (
    reasons.some((r) =>
      [
        "rateLimitExceeded",
        "userRateLimitExceeded",
        "quotaExceeded",
        "RATE_LIMIT_EXCEEDED"
      ].includes(r)
    ) ||
    e?.status === "RESOURCE_EXHAUSTED" ||
    /quota exceeded|rate limit/i.test(e?.message ?? "")
  ) {
    return "rate";
  }
  return "auth";
}

// Retries for usage limits and Google's own errors: exponential backoff with jitter, as Google
// recommends (2^n seconds plus up to a second, at most 32 s, or the Retry-After it sends).
export const GOOGLE_RETRIES = 5;
export function backoffMs(attempt: number, retryAfter: string | null) {
  const seconds = Number(retryAfter);
  if (retryAfter && Number.isFinite(seconds) && seconds > 0) return Math.min(seconds, 60) * 1000;
  return Math.min(2 ** attempt * 1000 + Math.floor(googleTiming.random() * 1000), 32_000);
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

// The Google account behind the app: the owner's (OWNER_EMAIL), so a tester's sign-in never
// switches Gmail to their mailbox. Without OWNER_EMAIL, the most recently used one.
export async function googleAccount(db: Executor) {
  const owner = ownerEmail();
  const [row] = await db
    .select({ account: accounts, email: users.email })
    .from(accounts)
    .innerJoin(users, eq(accounts.userId, users.id))
    .where(
      and(
        eq(accounts.providerId, "google"),
        owner ? eq(sql`lower(${users.email})`, owner) : undefined
      )
    )
    .orderBy(desc(accounts.updatedAt))
    .limit(1);
  return row ?? null;
}

// `mailbox` is the Gmail address (used in links); `me` holds her addresses, to tell her own
// messages from other people's. `pacer` keeps Gmail calls under the per-user quota.
export type GoogleSession = {
  token: string;
  mailbox: string;
  me: Set<string>;
  pacer?: GmailPacer;
};

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
    me: new Set([signIn, ...parseAllowedEmails(process.env.ALLOWED_EMAILS)]),
    pacer: pacerFor(row.account.id)
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
  init: {
    method?: "GET" | "POST";
    body?: unknown;
    query?: Query;
    notFound?: "null";
    // Gmail quota units, when the call is paced (gmail()).
    units?: number;
  }
): Promise<T | null> {
  const method = init.method ?? "GET";
  for (let attempt = 0; ; attempt++) {
    if (init.units && session.pacer) await session.pacer.take(init.units);
    const res = await fetch(withQuery(url, init.query), {
      method,
      headers: {
        Authorization: `Bearer ${session.token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {})
      },
      body: init.body ? JSON.stringify(init.body) : undefined
    });
    if (res.status === 404 && init.notFound === "null") return null;
    if (res.ok) return (await res.json()) as T;

    const failure = classifyGoogleError(res.status, await res.json().catch(() => null));
    if (failure === "auth") throw googleNotConnected();
    if (failure === "daily") {
      throw new ActionError(
        "rate_limited",
        "Gmail's daily limit for this app is used up. Try again tomorrow."
      );
    }
    // A usage limit means the call was not run, so any call may be retried. A server error on
    // a POST may have run (a draft saved), so only reads are retried then.
    const retryable = failure === "rate" || (failure === "server" && method === "GET");
    if (retryable && attempt < GOOGLE_RETRIES) {
      await googleTiming.sleep(backoffMs(attempt, res.headers.get("retry-after")));
      continue;
    }
    if (failure === "rate") throw googleRateLimited();
    throw new ActionError("unavailable", `Google didn't respond (error ${res.status}). Try again.`);
  }
}

// Gmail call; `path` is relative to users/me.
export async function gmail<T>(
  session: GoogleSession,
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; query?: Query } = {}
): Promise<T> {
  return (await google<T>(session, `${GMAIL_BASE}${path}`, {
    ...init,
    units: gmailUnits(path)
  })) as T;
}

// Same, but a missing item (deleted draft or thread) comes back as null.
export function gmailOptional<T>(session: GoogleSession, path: string, query?: Query) {
  return google<T>(session, `${GMAIL_BASE}${path}`, {
    query,
    notFound: "null",
    units: gmailUnits(path)
  });
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

// Runs `fn` over `items` with at most `limit` in flight, keeping order. Gmail calls are paced
// by the session's GmailPacer, so `limit` only overlaps their network time.
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

const bodyBase64 = (s: string) =>
  (base64(s.replace(/\r?\n/g, "\r\n")).match(/.{1,76}/g) ?? []).join("\r\n");

// An RFC 2822 message, base64url encoded for users.drafts.create and users.messages.send
// `raw`. Plain text, or multipart/alternative when an HTML version is given.
export function rawMessage(m: {
  to: string;
  toName?: string;
  subject: string;
  body: string;
  html?: string;
}) {
  const to = m.toName?.trim() ? `${displayName(m.toName.trim())} <${m.to}>` : m.to;
  const headers = [`To: ${to}`, `Subject: ${headerText(m.subject)}`, "MIME-Version: 1.0"];
  const part = (type: string, content: string) => [
    `Content-Type: ${type}; charset="UTF-8"`,
    "Content-Transfer-Encoding: base64",
    "",
    bodyBase64(content)
  ];
  let lines: string[];
  if (m.html === undefined) {
    lines = [...headers, ...part("text/plain", m.body)];
  } else {
    const boundary = `=_cmos_${randomUUID().replace(/-/g, "")}`;
    lines = [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      ...part("text/plain", m.body),
      `--${boundary}`,
      ...part("text/html", m.html),
      `--${boundary}--`
    ];
  }
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

// Links that open Gmail on her mailbox, whichever Google account is first in the browser.
// `?authuser=<address>` picks the account; an address in the `/u/` path can fail with
// "account temporarily unavailable" (6446).
export const gmailMessageLink = (mailbox: string, messageId: string) =>
  `https://mail.google.com/mail/?authuser=${encodeURIComponent(mailbox)}#all/${messageId}`;
export const gmailDraftLink = (mailbox: string, messageId: string) =>
  `https://mail.google.com/mail/?authuser=${encodeURIComponent(mailbox)}#drafts?compose=${messageId}`;
