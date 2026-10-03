import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as A from "@/actions";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import { fluentConfig } from "@/lib/fluentcrm";
import {
  HONEYPOT_FIELD,
  handleSignup,
  handleUnsubscribeWebhook,
  resetRateLimit
} from "@/lib/newsletter-http";
import { runNewsletterSync } from "@/lib/newsletter-sync";
import { freshDb } from "./test-db";

let db: Database;
let cleanup: () => void;
const ctx = () => ({ db });

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
});
afterAll(() => cleanup());

const ENV = {
  FLUENTCRM_URL: "https://crm.example.org/",
  FLUENTCRM_USER: "api-user",
  FLUENTCRM_APP_PASSWORD: "abcd efgh ijkl mnop",
  FLUENTCRM_LIST_ID: "7"
};

// An in-memory FluentCRM that answers the documented endpoints.
function fakeFluent(
  initial: { id: number; email: string; status: string; lists: number[] }[] = []
) {
  const subs = initial.map((s) => ({ ...s }));
  let nextId = 100;
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const authHeaders = new Set<string>();
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const path = url.pathname.replace("/wp-json/fluent-crm/v2", "");
    calls.push({ method, path: path + url.search, body });
    authHeaders.add(new Headers(init?.headers).get("authorization") ?? "");
    const json = (data: unknown, status = 200) => Response.json(data, { status });

    if (method === "GET" && path === "/subscribers/0") {
      const s = subs.find((x) => x.email === url.searchParams.get("get_by_email"));
      return s ? json({ subscriber: s, custom_fields: [] }) : json({ message: "nope" }, 404);
    }
    if (method === "POST" && path === "/subscribers") {
      if (subs.some((x) => x.email === body.email)) return json({ message: "exists" }, 422);
      const s = { id: nextId++, email: body.email, status: body.status, lists: body.lists };
      subs.push(s);
      return json({ message: "created", contact: s });
    }
    const m = path.match(/^\/subscribers\/(\d+)$/);
    if (method === "PUT" && m) {
      const s = subs.find((x) => x.id === Number(m[1]));
      if (!s) return json({ message: "nope" }, 404);
      const { attach_lists = [], detach_lists = [] } = body.subscriber;
      s.lists = [...new Set([...s.lists, ...attach_lists])].filter(
        (l) => !detach_lists.includes(l)
      );
      return json({ message: "updated", contact: s });
    }
    return json({ message: "unexpected" }, 500);
  }) as typeof fetch;
  return { subs, calls, authHeaders, fetch: fetchImpl };
}

async function addContact(values: Partial<typeof t.contacts.$inferInsert> & { fullName: string }) {
  const [row] = await db
    .insert(t.contacts)
    .values({ source: "sample", ...values })
    .returning();
  return row;
}

async function contact(id: string) {
  const [row] = await db.select().from(t.contacts).where(eq(t.contacts.id, id));
  return row;
}

describe("FluentCRM settings", () => {
  it("is not connected while settings are missing or placeholders", () => {
    expect(fluentConfig({})).toBeNull();
    expect(
      fluentConfig({
        FLUENTCRM_URL: "https://YOUR_WORDPRESS_SITE_HERE",
        FLUENTCRM_USER: "YOUR_WORDPRESS_USERNAME_HERE",
        FLUENTCRM_APP_PASSWORD: "YOUR_APPLICATION_PASSWORD_HERE",
        FLUENTCRM_LIST_ID: "YOUR_LIST_ID_HERE"
      })
    ).toBeNull();
    expect(fluentConfig({ ...ENV, FLUENTCRM_LIST_ID: "YOUR_LIST_ID_HERE" })).toBeNull();
    expect(fluentConfig({ ...ENV, FLUENTCRM_URL: "http://crm.example.org" })).toBeNull();
  });

  it("builds the REST base URL from the site address", () => {
    expect(fluentConfig(ENV)).toMatchObject({
      baseUrl: "https://crm.example.org/wp-json/fluent-crm/v2",
      listId: 7
    });
  });
});

describe("newsletter flag", () => {
  it("toggles on and off, logs it, and refuses contacts without an email", async () => {
    const c = await addContact({ fullName: "Flag Person", email: "flag@example.com" });
    const on = await A.setNewsletter.run({ contactId: c.id, on: true }, ctx());
    expect(on.newsletter).toBe(true);
    expect(on.newsletterChangedAt).toBeInstanceOf(Date);

    const found = await A.searchContacts.run({ newsletter: true }, ctx());
    expect(found.contacts.map((x) => x.id)).toContain(c.id);

    const off = await A.setNewsletter.run({ contactId: c.id, on: false }, ctx());
    expect(off.newsletter).toBe(false);

    const log = await db
      .select()
      .from(t.activityLog)
      .where(eq(t.activityLog.action, "setNewsletter"));
    expect(log.map((l) => l.summary)).toEqual([
      "Added Flag Person to the newsletter",
      "Took Flag Person off the newsletter"
    ]);

    const noEmail = await addContact({ fullName: "No Email" });
    await expect(A.setNewsletter.run({ contactId: noEmail.id, on: true }, ctx())).rejects.toThrow(
      /no email/
    );
  });
});

describe("newsletter sync", () => {
  it("says not connected and touches nothing when FluentCRM isn't set up", async () => {
    const c = await addContact({ fullName: "Waiting", email: "waiting@example.com" });
    await A.setNewsletter.run({ contactId: c.id, on: true }, ctx());
    const crm = fakeFluent();
    const r = await runNewsletterSync({ ctx: ctx(), env: {}, fetch: crm.fetch });
    expect(r).toEqual({ connected: false });
    expect(crm.calls).toHaveLength(0);
    expect((await contact(c.id)).newsletterSyncedAt).toBeNull();

    const status = await A.newsletterStatus.run({}, ctx());
    expect(status.waiting).toBeGreaterThan(0);
  });

  it("creates new subscribers, adds existing ones to the list, and never re-subscribes", async () => {
    await db.update(t.contacts).set({ newsletter: false, fluentcrmId: null });
    const fresh = await addContact({
      fullName: "New Sub",
      firstName: "New",
      lastName: "Sub",
      email: "new@example.com"
    });
    const known = await addContact({ fullName: "Known Sub", email: "Known@Example.com" });
    const gone = await addContact({ fullName: "Gone Sub", email: "gone@example.com" });
    for (const c of [fresh, known, gone]) {
      await A.setNewsletter.run({ contactId: c.id, on: true }, ctx());
    }
    const crm = fakeFluent([
      { id: 5, email: "Known@Example.com", status: "subscribed", lists: [1] },
      { id: 6, email: "gone@example.com", status: "unsubscribed", lists: [] }
    ]);

    const r = await runNewsletterSync({ ctx: ctx(), env: ENV, fetch: crm.fetch });
    expect(r).toMatchObject({ connected: true, added: 2, blocked: 1, failed: 0 });

    const expected = `Basic ${Buffer.from("api-user:abcd efgh ijkl mnop").toString("base64")}`;
    expect([...crm.authHeaders]).toEqual([expected]);

    const created = crm.subs.find((s) => s.email === "new@example.com")!;
    expect(created).toMatchObject({ status: "subscribed", lists: [7] });
    expect(crm.calls.find((c) => c.method === "POST")?.body).toMatchObject({
      first_name: "New",
      last_name: "Sub"
    });
    expect(crm.subs.find((s) => s.id === 5)!.lists).toEqual([1, 7]);
    expect(crm.subs.find((s) => s.id === 6)).toMatchObject({ status: "unsubscribed", lists: [] });

    expect(await contact(fresh.id)).toMatchObject({ fluentcrmId: created.id, newsletter: true });
    expect((await contact(fresh.id)).newsletterSyncedAt).toBeInstanceOf(Date);
    expect(await contact(known.id)).toMatchObject({ fluentcrmId: 5 });
    expect(await contact(gone.id)).toMatchObject({ fluentcrmId: 6, newsletter: false });

    // Nothing left to do: a second sync makes no calls.
    crm.calls.length = 0;
    const again = await runNewsletterSync({ ctx: ctx(), env: ENV, fetch: crm.fetch });
    expect(again).toMatchObject({ added: 0, removed: 0, failed: 0 });
    expect(crm.calls).toHaveLength(0);

    // Turning the flag off takes them off the list on the next sync.
    await new Promise((r) => setTimeout(r, 5));
    await A.setNewsletter.run({ contactId: known.id, on: false }, ctx());
    const removal = await runNewsletterSync({ ctx: ctx(), env: ENV, fetch: crm.fetch });
    expect(removal).toMatchObject({ removed: 1 });
    expect(crm.subs.find((s) => s.id === 5)!.lists).toEqual([1]);

    const status = await A.newsletterStatus.run({}, ctx());
    expect(status).toMatchObject({ connected: false, waiting: 0 });
    expect(status.lastSyncedAt).toBeInstanceOf(Date);
  });

  it("keeps failed contacts queued and stops on a refused login", async () => {
    await db.update(t.contacts).set({ newsletter: false, fluentcrmId: null });
    const a = await addContact({ fullName: "Retry A", email: "retry-a@example.com" });
    const b = await addContact({ fullName: "Retry B", email: "retry-b@example.com" });
    await A.setNewsletter.run({ contactId: a.id, on: true }, ctx());
    await A.setNewsletter.run({ contactId: b.id, on: true }, ctx());
    let calls = 0;
    const refuse = (async () => {
      calls++;
      return new Response("no", { status: 401 });
    }) as unknown as typeof fetch;

    const r = await runNewsletterSync({ ctx: ctx(), env: ENV, fetch: refuse });
    expect(r).toMatchObject({ connected: true, added: 0, failed: 2 });
    expect(r.connected && r.error).toMatch(/refused the login/);
    expect(calls).toBe(1);
    expect((await contact(a.id)).newsletterSyncedAt).toBeNull();
    expect((await A.newsletterQueue.run({}, ctx())).add.map((c) => c.contactId)).toEqual(
      expect.arrayContaining([a.id, b.id])
    );
  });
});

const SECRET = "s3cret-s3cret-s3cret";
const hook = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/newsletter/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });

describe("unsubscribe webhook", () => {
  it("refuses requests without the right secret, and when no secret is configured", async () => {
    const env = { NEWSLETTER_WEBHOOK_SECRET: SECRET };
    const opts = { ctx: ctx(), env };
    expect((await handleUnsubscribeWebhook(hook({ email: "x@example.com" }), opts)).status).toBe(
      401
    );
    expect(
      (
        await handleUnsubscribeWebhook(
          hook({ email: "x@example.com" }, { "x-webhook-secret": "wrong-wrong-wrong-wrong" }),
          opts
        )
      ).status
    ).toBe(401);
    const unset = await handleUnsubscribeWebhook(
      hook({ email: "x@example.com" }, { "x-webhook-secret": SECRET }),
      { ctx: ctx(), env: { NEWSLETTER_WEBHOOK_SECRET: "YOUR_NEWSLETTER_WEBHOOK_SECRET_HERE" } }
    );
    expect(unset.status).toBe(503);
  });

  it("clears the flag for the contact FluentCRM reports, without queueing a sync", async () => {
    const c = await addContact({
      fullName: "Leaving Person",
      email: "Leaving@Example.com",
      newsletter: true,
      newsletterChangedAt: new Date(),
      fluentcrmId: 42
    });
    const opts = { ctx: ctx(), env: { NEWSLETTER_WEBHOOK_SECRET: SECRET } };
    const res = await handleUnsubscribeWebhook(
      hook(
        { id: 42, email: "leaving@example.com", status: "unsubscribed" },
        { "x-webhook-secret": SECRET }
      ),
      opts
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, matched: true, changed: true });
    const row = await contact(c.id);
    expect(row.newsletter).toBe(false);
    const queue = await A.newsletterQueue.run({}, ctx());
    expect(queue.remove.map((q) => q.contactId)).not.toContain(c.id);

    // Bearer form, nested payload, unknown email: accepted, nothing changes.
    const other = await handleUnsubscribeWebhook(
      hook(
        { subscriber: { email: "stranger@example.com" } },
        { authorization: `Bearer ${SECRET}` }
      ),
      opts
    );
    expect(await other.json()).toEqual({ ok: true, matched: false, changed: false });
  });
});

const signup = (body: Record<string, string>, ip = "203.0.113.1", form = false) =>
  new Request("http://localhost/api/newsletter/signup", {
    method: "POST",
    headers: {
      "x-forwarded-for": ip,
      ...(form ? {} : { "content-type": "application/json" })
    },
    body: form ? new URLSearchParams(body) : JSON.stringify(body)
  });

describe("signup endpoint", () => {
  beforeEach(() => resetRateLimit());

  it("creates a flagged contact, or flags an existing one", async () => {
    const res = await handleSignup(signup({ email: " Fresh@Example.com ", name: "Fresh Face" }), {
      ctx: ctx()
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const [created] = await db
      .select()
      .from(t.contacts)
      .where(eq(t.contacts.email, "fresh@example.com"));
    expect(created).toMatchObject({
      fullName: "Fresh Face",
      firstName: "Fresh",
      lastName: "Face",
      source: "newsletter_signup",
      newsletter: true
    });

    const existing = await addContact({ fullName: "Already Here", email: "Here@Example.com" });
    const form = await handleSignup(
      signup(
        { email: "here@example.com", first_name: "Someone", last_name: "Else" },
        "203.0.113.2",
        true
      ),
      { ctx: ctx() }
    );
    expect(form.status).toBe(200);
    const row = await contact(existing.id);
    expect(row).toMatchObject({ newsletter: true, fullName: "Already Here" });
    const same = await db.select().from(t.contacts).where(eq(t.contacts.email, "here@example.com"));
    expect(same).toHaveLength(0);
  });

  it("rejects bad emails, ignores the honeypot, and rate-limits per IP", async () => {
    const bad = await handleSignup(signup({ email: "not-an-email" }), { ctx: ctx() });
    expect(bad.status).toBe(400);

    const bot = await handleSignup(
      signup({ email: "bot@example.com", [HONEYPOT_FIELD]: "http://spam.example" }),
      { ctx: ctx() }
    );
    expect(bot.status).toBe(200);
    const botRows = await db
      .select()
      .from(t.contacts)
      .where(eq(t.contacts.email, "bot@example.com"));
    expect(botRows).toHaveLength(0);

    resetRateLimit();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const r = await handleSignup(signup({ email: `burst${i}@example.com` }, "198.51.100.9"), {
        ctx: ctx()
      });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    const other = await handleSignup(signup({ email: "other-ip@example.com" }, "198.51.100.10"), {
      ctx: ctx()
    });
    expect(other.status).toBe(200);
  });
});
