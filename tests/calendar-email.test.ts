import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Better Auth hands out the stored Google token; no real Google calls in tests.
const getAccessToken = vi.hoisted(() => vi.fn(async () => ({ accessToken: "test-token" })));
vi.mock("@/lib/auth", () => ({ auth: { api: { getAccessToken } } }));
// Resend is never called for real.
const resendSend = vi.hoisted(() => vi.fn(async () => ({ data: { id: "r1" }, error: null })));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  }
}));

import * as A from "@/actions";
import { feedUrl, webcalUrl } from "@/components/settings/calendar-feed-card";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import { calendarResponse } from "@/lib/calendar-feed";
import { calendarDay } from "@/lib/calendar-ics";
import {
  composeSummaryEmail,
  runDailySummary,
  type OutgoingEmail,
  type Transport
} from "@/lib/daily-summary";
import { GOOGLE_SCOPES } from "@/lib/google-scopes";
import { freshDb } from "./test-db";

let db: Database;
let cleanup: () => void;
const ctx = () => ({ db });

const DAY = 86_400_000;
// Noon in Los Angeles on Oct 3, 2026.
const now = new Date("2026-10-03T19:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * DAY);
const ahead = (days: number) => new Date(now.getTime() + days * DAY);
const USER = "u1";
const ME = "simone@simonepaz.com";
const BASE = "https://cm.example.com";
const GMAIL = "gmail.googleapis.com/gmail/v1/users/me";

let sourceId: string;
const grant = (
  title: string,
  deadline: Date | null,
  extra: Partial<typeof t.grants.$inferInsert> = {}
) => ({
  sourceId,
  externalId: title,
  title,
  deadline,
  forProfitEligible: true,
  raw: {},
  firstSeenAt: ago(30),
  ...extra
});

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
  await db.insert(t.users).values({ id: USER, name: "Simone", email: ME, createdAt: ago(100) });
  const [src] = await db
    .insert(t.sources)
    .values({ slug: "g", name: "Grants", kind: "grants_gov", url: "https://example.com" })
    .returning();
  sourceId = src.id;
});
afterAll(() => {
  vi.unstubAllGlobals();
  cleanup();
});

// ---------------------------------------------------------------- Calendar feed

const feed = (file: string) => calendarResponse(file, BASE, { db, now });
const unfold = (ics: string) => ics.replace(/\r\n[ \t]/g, "");

describe("calendar feed", () => {
  let token: string;

  beforeAll(async () => {
    const p = await A.createProject.run({ name: "Docuseries" }, ctx());
    await db.insert(t.grants).values([
      // Day-only deadlines are stored at noon UTC (ingest/grants/types.ts dateOnly).
      grant("Soon for-profit", new Date("2026-10-20T12:00:00Z"), { agency: "NSF" }),
      grant("Far for-profit", ahead(90)),
      grant("Board grant far out", ahead(120), { forProfitEligible: false, status: "applying" }),
      grant("Passed on", ahead(10), { status: "passed" }),
      grant("Closed", ago(2)),
      grant("Rolling", null),
      grant("Not eligible", ahead(10), { forProfitEligible: false })
    ]);
    await db.insert(t.tasks).values([
      // A due date picked in the browser is local noon (projects/types.ts fromDateInput).
      {
        id: "task-open",
        title: "Send deck",
        projectId: p.id,
        dueDate: new Date("2026-10-08T19:00:00Z")
      },
      { id: "task-loose", title: "Call bank", dueDate: ahead(2) },
      { id: "task-done", title: "Done already", status: "done", dueDate: ahead(1) },
      { id: "task-nodate", title: "Someday" }
    ]);
  });

  it("returns 404 before a link exists, and for malformed or unknown tokens", async () => {
    expect((await feed("x".repeat(32) + ".ics")).status).toBe(404);
    expect((await feed("short.ics")).status).toBe(404);
    expect((await feed("x".repeat(32))).status).toBe(404);
    expect((await feed("../../etc.ics")).status).toBe(404);
  });

  it("creates a link from Settings and serves an all-day calendar for it", async () => {
    const created = await A.resetCalendarLink.run({ userId: USER }, ctx());
    expect(created.replaced).toBe(false);
    token = created.calendarToken;
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const res = await feed(`${token}.ics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("cache-control")).toContain("no-store");
    const ics = unfold(await res.text());

    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toContain("X-WR-CALNAME:Cultured Matter");
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics).toContain("X-PUBLISHED-TTL:PT1H");

    const summaries = [...ics.matchAll(/^SUMMARY:(.*)$/gm)].map((m) => m[1]);
    expect(summaries.sort()).toEqual([
      "Due: Call bank",
      "Due: Send deck",
      "Grant deadline: Board grant far out",
      "Grant deadline: Soon for-profit"
    ]);
  });

  it("writes deadlines and due dates as all-day events on her calendar day, with links", async () => {
    const ics = unfold(await (await feed(`${token}.ics`)).text());
    const event = (uid: string) => {
      const m = ics.match(
        new RegExp(`BEGIN:VEVENT\\r\\n(?:(?!END:VEVENT)[\\s\\S])*UID:${uid}[\\s\\S]*?END:VEVENT`)
      );
      expect(m, uid).not.toBeNull();
      return m![0];
    };
    const [soon] = await db.select().from(t.grants).where(eq(t.grants.title, "Soon for-profit"));
    const g = event(`grant-${soon.id}@cultured-matter-os`);
    expect(g).toContain("DTSTART;VALUE=DATE:20261020");
    expect(g).toContain("DTEND;VALUE=DATE:20261021");
    expect(g).toContain("TRANSP:TRANSPARENT");
    expect(g).toContain(`URL;VALUE=URI:${BASE}/grants?q=Soon+for-profit`);
    expect(g).toContain("DESCRIPTION:NSF");

    const task = event("task-task-open@cultured-matter-os");
    expect(task).toContain("DTSTART;VALUE=DATE:20261008");
    expect(task).toMatch(/URL;VALUE=URI:https:\/\/cm\.example\.com\/projects\?p=/);
    expect(task).toContain("DESCRIPTION:Project: Docuseries");
    expect(event("task-task-loose@cultured-matter-os")).toContain(`${BASE}/projects?view=tasks`);
  });

  it("keeps UIDs stable across refreshes and picks up changes", async () => {
    const uids = async () =>
      [...unfold(await (await feed(`${token}.ics`)).text()).matchAll(/^UID:(.*)$/gm)]
        .map((m) => m[1])
        .sort();
    const first = await uids();
    expect(await uids()).toEqual(first);

    await db.update(t.tasks).set({ status: "done" }).where(eq(t.tasks.id, "task-loose"));
    expect(await uids()).toEqual(first.filter((u) => u !== "task-task-loose@cultured-matter-os"));
  });

  it("reset makes the old link 404 and the new one work", async () => {
    const reset = await A.resetCalendarLink.run({ userId: USER }, ctx());
    expect(reset.replaced).toBe(true);
    expect(reset.calendarToken).not.toBe(token);
    expect((await feed(`${token}.ics`)).status).toBe(404);
    expect((await feed(`${reset.calendarToken}.ics`)).status).toBe(200);
    expect((await A.getUserSettings.run({ userId: USER }, ctx())).calendarToken).toBe(
      reset.calendarToken
    );

    // The log says what happened, never the token.
    const log = await db
      .select()
      .from(t.activityLog)
      .where(eq(t.activityLog.action, "resetCalendarLink"));
    expect(log.map((l) => l.summary)).toEqual([
      "Created the calendar feed link",
      "Reset the calendar feed link"
    ]);
    expect(JSON.stringify(log)).not.toContain(reset.calendarToken);
    token = reset.calendarToken;
  });

  it("builds the Apple Calendar subscribe link", () => {
    const url = feedUrl("https://cm.example.com", "abc");
    expect(url).toBe("https://cm.example.com/api/calendar/abc.ics");
    expect(webcalUrl(url)).toBe("webcal://cm.example.com/api/calendar/abc.ics");
  });

  it("maps instants to her calendar day", () => {
    // 11pm in Los Angeles is already the next day in UTC.
    expect(calendarDay(new Date("2026-10-09T06:00:00Z")).toISOString()).toBe(
      "2026-10-08T00:00:00.000Z"
    );
  });
});

// ---------------------------------------------------------------- Daily summary

function fakeTransport(): Transport & { sent: OutgoingEmail[] } {
  const sent: OutgoingEmail[] = [];
  return { via: "gmail", sent, send: async (e) => void sent.push(e) };
}
const run = (transport: Transport, at = now) =>
  runDailySummary({ db, now: at, transport, baseUrl: BASE });

describe("daily summary", () => {
  beforeAll(async () => {
    // Start from a clean slate of things that could be news.
    await db.delete(t.grants);
    await db.delete(t.tasks);
  });

  it("is off by default and the toggle turns it on and off", async () => {
    expect((await A.getUserSettings.run({ userId: USER }, ctx())).dailyEmail).toBe(false);
    const transport = fakeTransport();
    expect(await run(transport)).toEqual({ ok: true, sent: false, skipped: "Daily email is off" });

    await A.setDailyEmail.run({ userId: USER, enabled: true }, ctx());
    expect((await A.getUserSettings.run({ userId: USER }, ctx())).dailyEmail).toBe(true);
    await A.setDailyEmail.run({ userId: USER, enabled: false }, ctx());
    expect((await A.getUserSettings.run({ userId: USER }, ctx())).dailyEmail).toBe(false);
    const log = await db
      .select()
      .from(t.activityLog)
      .where(eq(t.activityLog.action, "setDailyEmail"));
    expect(log.map((l) => l.summary)).toEqual([
      "Turned the daily email on",
      "Turned the daily email off"
    ]);
    await A.setDailyEmail.run({ userId: USER, enabled: true }, ctx());
    expect(transport.sent).toHaveLength(0);
  });

  it("skips sending when nothing is new, without logging", async () => {
    const transport = fakeTransport();
    expect(await run(transport)).toEqual({ ok: true, sent: false, skipped: "Nothing new" });
    expect(transport.sent).toHaveLength(0);
    const log = await db
      .select()
      .from(t.activityLog)
      .where(eq(t.activityLog.action, "recordDailySummary"));
    expect(log).toHaveLength(0);
  });

  it("does not count an old approval or a grant already in the 7-day window as news", async () => {
    await db
      .insert(t.approvals)
      .values({ action: "x", payload: {}, summary: "Old one", createdAt: ago(3) });
    // In the window since well before yesterday.
    await db.insert(t.grants).values(grant("Already closing", ahead(2)));
    const s = await A.dailySummary.run({ userId: USER, now }, ctx());
    expect(s.hasNews).toBe(false);
    expect(s.approvals.map((a) => a.detail)).toEqual(["Old one"]);
    expect(s.closingGrants.map((g) => g.title)).toEqual(["Already closing"]);
  });

  it("composes new grants, closing grants, radar finds, replies and approvals", async () => {
    const p = await A.createProject.run({ name: "Film" }, ctx());
    await db
      .insert(t.grants)
      .values([
        grant("Fresh grant", ahead(40), { agency: "NEA", firstSeenAt: ago(0.5) }),
        grant("Fresh rolling", null, { firstSeenAt: ago(0.5) }),
        grant("Fresh but not eligible", ahead(40), {
          forProfitEligible: false,
          firstSeenAt: ago(0.5)
        }),
        grant("Just entered window", ahead(6.5))
      ]);
    await db.insert(t.companies).values([
      { name: "Newco", normalizedName: "newco", firstSeenAt: ago(0.3), status: "new" },
      { name: "Oldco", normalizedName: "oldco", firstSeenAt: ago(5), status: "new" }
    ]);
    await db.insert(t.tasks).values([
      {
        title: "Pitch to Ana",
        status: "replied",
        emailThreadId: "th1",
        projectId: p.id,
        updatedAt: ago(0.2)
      },
      { title: "Older reply", status: "replied", emailThreadId: "th2", updatedAt: ago(4) }
    ]);
    await db
      .insert(t.approvals)
      .values({ action: "x", payload: {}, summary: "Send follow-up", createdAt: ago(0.1) });

    const s = await A.dailySummary.run({ userId: USER, now }, ctx());
    expect(s.hasNews).toBe(true);
    expect(s.newGrants.map((g) => g.title)).toEqual(["Fresh grant", "Fresh rolling"]);
    expect(s.newGrants[0]).toMatchObject({
      detail: "NEA, closes Nov 12",
      href: "/grants?q=Fresh+grant"
    });
    expect(s.newGrants[1].detail).toBe("rolling");
    expect(s.closingGrants.map((g) => g.title)).toEqual(["Already closing", "Just entered window"]);
    expect(s.radar).toMatchObject({
      detail: "1 new company since your last visit",
      href: "/radar?new=1"
    });
    expect(s.replies).toEqual([
      { title: "Reply arrived", detail: "Pitch to Ana", href: `/projects?p=${p.id}` }
    ]);
    expect(s.approvals.map((a) => a.detail)).toEqual(["Send follow-up", "Old one"]);

    const email = composeSummaryEmail(s, BASE, now);
    expect(email.subject).toBe("Your day in Cultured Matter: Saturday, October 3");
    expect(email.text).toContain("NEW GRANTS (2)");
    expect(email.text).toContain(
      `- Fresh grant (NEA, closes Nov 12)\n  ${BASE}/grants?q=Fresh+grant`
    );
    expect(email.text).toContain("GRANTS CLOSING WITHIN 7 DAYS");
    expect(email.text).toContain(`${BASE}/radar?new=1`);
    expect(email.text).toContain(`${BASE}/projects?p=${p.id}`);
    expect(email.text).toContain(`${BASE}/today#approvals`);
    expect(email.text).toContain(`${BASE}/settings`);
    expect(email.html).toContain(`<a href="${BASE}/grants?q=Fresh+grant"`);
    expect(email.html).toContain("Waiting for your approval");
  });

  it("escapes HTML in titles", () => {
    const email = composeSummaryEmail(
      {
        since: ago(1),
        newGrants: [{ title: "<b>A & B</b>", detail: null, href: "/grants" }],
        newGrantsTotal: 1,
        closingGrants: [],
        radar: null,
        replies: [],
        approvals: [],
        hasNews: true
      },
      BASE,
      now
    );
    expect(email.html).toContain("&lt;b&gt;A &amp; B&lt;/b&gt;");
    expect(email.html).not.toContain("<b>A");
  });

  it("sends one email to her, logs it, and sends nothing more until something new arrives", async () => {
    const transport = fakeTransport();
    const result = await run(transport);
    expect(result).toMatchObject({ ok: true, sent: true, via: "gmail" });
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({ to: ME, toName: "Simone" });
    expect((await A.getUserSettings.run({ userId: USER }, ctx())).lastSummaryAt).toEqual(now);
    const [log] = await db
      .select()
      .from(t.activityLog)
      .where(eq(t.activityLog.action, "recordDailySummary"));
    expect(log.summary).toMatch(/^Sent the daily summary \(\d+ items\) via Gmail$/);

    // The next morning with nothing new: no email.
    const next = fakeTransport();
    expect(await run(next, ahead(1))).toEqual({ ok: true, sent: false, skipped: "Nothing new" });
    expect(next.sent).toHaveLength(0);
  });

  it("skips and records why when Google isn't connected, keeping the news for tomorrow", async () => {
    await db
      .insert(t.approvals)
      .values({ action: "x", payload: {}, summary: "Another", createdAt: ahead(1.5) });
    const at = ahead(2);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 }))
    );
    // No Google account at all.
    const { gmailTransport } = await import("@/lib/daily-summary");
    expect(await run(gmailTransport(db), at)).toEqual({
      ok: true,
      sent: false,
      skipped: "Google isn't connected"
    });
    const logs = await db
      .select()
      .from(t.activityLog)
      .where(eq(t.activityLog.action, "recordDailySummary"));
    expect(logs.at(-1)!.summary).toBe("Skipped the daily summary: Google isn't connected");
    expect((await A.getUserSettings.run({ userId: USER }, ctx())).lastSummaryAt).toEqual(now);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends through her Gmail (users.messages.send) as a multipart message to herself", async () => {
    await db.insert(t.accounts).values({
      id: "acc1",
      accountId: "google-sub",
      providerId: "google",
      userId: USER,
      scope: ["openid", "email", "profile", ...GOOGLE_SCOPES].join(" "),
      updatedAt: new Date()
    });
    const calls: { url: string; body: any }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = new URL(input);
        calls.push({
          url: url.host + url.pathname,
          body: init?.body ? JSON.parse(String(init.body)) : null
        });
        if (url.pathname.endsWith("/profile")) return Response.json({ emailAddress: ME });
        return Response.json({ id: "m1", threadId: "t1" });
      })
    );
    const { gmailTransport } = await import("@/lib/daily-summary");
    const result = await run(gmailTransport(db), ahead(2));
    expect(result).toMatchObject({ ok: true, sent: true, via: "gmail" });

    const send = calls.find((c) => c.url === `${GMAIL}/messages/send`)!;
    expect(send).toBeDefined();
    const raw = Buffer.from(send.body.raw, "base64url").toString("utf8");
    expect(raw).toContain(`To: "Simone" <${ME}>`);
    expect(raw).toMatch(/Content-Type: multipart\/alternative; boundary="=_cmos_[0-9a-f]+"/);
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(raw).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("uses Resend only when EMAIL_TRANSPORT=resend", async () => {
    vi.stubEnv("EMAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Cultured Matter OS <no-reply@send.example.com>");
    const { pickTransport } = await import("@/lib/daily-summary");
    const transport = pickTransport(db);
    expect(transport.via).toBe("resend");
    await transport.send({ to: ME, subject: "S", text: "T", html: "<p>H</p>" });
    expect(resendSend).toHaveBeenCalledWith({
      from: "Cultured Matter OS <no-reply@send.example.com>",
      to: ME,
      subject: "S",
      text: "T",
      html: "<p>H</p>"
    });
    vi.unstubAllEnvs();
    expect(pickTransport(db).via).toBe("gmail");
  });
});
