import { timingSafeEqual } from "node:crypto";
import { z } from "zod/v4";

import type { ActionContext } from "@/actions/define";
import { newsletterSignup, newsletterUnsubscribe } from "@/actions/newsletter";

// The two public newsletter endpoints. proxy.ts lets them through without a session, so each
// one guards itself: the webhook with a shared secret, the signup with a honeypot and a rate
// limit. Both call the actions' `.run` directly (the server-action wrappers need a session).

type Env = Record<string, string | undefined>;
type Options = { ctx?: ActionContext; env?: Env; now?: number };

const MAX_BODY = 16_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers });

// JSON, urlencoded or multipart: Zapier, FluentCRM and a plain HTML form all send different ones.
async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return null;
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const body = await request.json();
      return body && typeof body === "object" && !Array.isArray(body) ? body : null;
    }
    const form = await request.formData();
    return Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  } catch {
    return null;
  }
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

// ---------------------------------------------------------------- Signup rate limit

// Per-IP sliding window, in memory. On Vercel each warm instance keeps its own window, so this
// slows a flood rather than stopping a determined attacker; the honeypot catches the bots.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, number[]>();

export function rateLimited(ip: string, now = Date.now()) {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [key, times] of hits) if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
  }
  return false;
}

export function resetRateLimit() {
  hits.clear();
}

function clientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

// Field name a person never sees (hidden with CSS); bots fill every field they find.
export const HONEYPOT_FIELD = "website";

export function signupPreflight() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function handleSignup(request: Request, opts: Options = {}) {
  if (rateLimited(clientIp(request), opts.now)) {
    return json({ ok: false, error: "Too many signups, try again later" }, 429, CORS);
  }
  const body = await readBody(request);
  if (!body) return json({ ok: false, error: "Send an email address" }, 400, CORS);

  // Pretend it worked so the bot learns nothing.
  if (str(body[HONEYPOT_FIELD])) return json({ ok: true }, 200, CORS);

  const name =
    str(body.name) ??
    ([str(body.first_name ?? body.firstName), str(body.last_name ?? body.lastName)]
      .filter(Boolean)
      .join(" ") ||
      undefined);
  try {
    await newsletterSignup.run({ email: str(body.email) ?? "", name }, opts.ctx);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return json({ ok: false, error: "That email doesn't look right" }, 400, CORS);
    }
    console.error("newsletter signup failed");
    return json({ ok: false, error: "Something went wrong" }, 500, CORS);
  }
  // Same answer for new and existing contacts, so the endpoint can't be used to probe emails.
  return json({ ok: true }, 200, CORS);
}

// ---------------------------------------------------------------- Unsubscribe webhook

const PLACEHOLDER = /^(your[_-]|changeme|placeholder)|_here$/i;

function webhookSecret(env: Env) {
  const s = env.NEWSLETTER_WEBHOOK_SECRET?.trim();
  return s && !PLACEHOLDER.test(s) && s.length >= 16 ? s : null;
}

function sameSecret(given: string | null, expected: string) {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function handleUnsubscribeWebhook(request: Request, opts: Options = {}) {
  const secret = webhookSecret(opts.env ?? process.env);
  if (!secret) return json({ ok: false, error: "Webhook not configured" }, 503);

  const auth = request.headers.get("authorization");
  const given =
    request.headers.get("x-webhook-secret") ??
    (auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null);
  if (!sameSecret(given, secret)) return json({ ok: false, error: "Unauthorized" }, 401);

  const body = await readBody(request);
  if (!body) return json({ ok: false, error: "Expected a contact" }, 400);

  // FluentCRM's outgoing webhook sends the contact's fields at the top level ("Full
  // Subscriber Data"); also accept them nested under subscriber or contact.
  const nested = (body.subscriber ?? body.contact) as Record<string, unknown> | undefined;
  const source = nested && typeof nested === "object" ? nested : body;
  const email = str(source.email);
  const rawId = Number(source.id ?? source.subscriber_id ?? body.subscriber_id);
  const fluentcrmId = Number.isInteger(rawId) && rawId > 0 ? rawId : undefined;

  try {
    const r = await newsletterUnsubscribe.run({ email, fluentcrmId }, opts.ctx);
    return json({ ok: true, matched: !!r.contactId, changed: r.changed });
  } catch (e) {
    if (e instanceof z.ZodError) return json({ ok: false, error: "Expected an email" }, 400);
    console.error("newsletter webhook failed");
    return json({ ok: false, error: "Something went wrong" }, 500);
  }
}
