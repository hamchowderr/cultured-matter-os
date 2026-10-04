import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// web-push never reaches a real push service in tests.
const sendNotification = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => ({ statusCode: 201, body: "", headers: {} }))
);
vi.mock("web-push", () => ({ default: { sendNotification } }));
// Better Auth hands out the stored Google token; no real Google calls in tests.
const getAccessToken = vi.hoisted(() => vi.fn(async () => ({ accessToken: "test-token" })));
vi.mock("@/lib/auth", () => ({ auth: { api: { getAccessToken } } }));

import * as A from "@/actions";
import { deviceLabel } from "@/actions/push";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import { composeSummaryPush, runDailySummary, type Transport } from "@/lib/daily-summary";
import { GOOGLE_SCOPES } from "@/lib/google-scopes";
import { approvalPush, replyPush, sendPush, type PushPayload } from "@/lib/push";
import { vapidConfig } from "@/lib/push-config";
import { freshDb } from "./test-db";

let db: Database;
let cleanup: () => void;
const ctx = () => ({ db });

const USER = "u1";
const ME = "simone@simonepaz.com";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const ENDPOINT = "https://web.push.apple.com/QGuQyavXutnMH-iPhone";
const KEYS = { p256dh: "BPhone-p256dh-key", auth: "phone-auth" };
const DAY = 86_400_000;

const payloads = () =>
  sendNotification.mock.calls.map((c) => JSON.parse(c[1] as string) as PushPayload);
const subscriptions = () => db.select().from(t.pushSubscriptions);
const logOf = async (action: string) =>
  (await db.select().from(t.activityLog).where(eq(t.activityLog.action, action))).map(
    (l) => l.summary
  );

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
  await db.insert(t.users).values({ id: USER, name: "Simone", email: ME });
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  cleanup();
});
beforeEach(() => {
  sendNotification.mockReset();
  sendNotification.mockResolvedValue({ statusCode: 201, body: "", headers: {} });
  vi.stubEnv("VAPID_PUBLIC_KEY", "test-public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "test-private-key");
  vi.stubEnv("VAPID_SUBJECT", "");
  vi.stubEnv("BETTER_AUTH_URL", "https://cm.example.com");
});

const subscribePhone = () =>
  A.savePushSubscription.run(
    { userId: USER, endpoint: ENDPOINT, keys: KEYS, userAgent: IPHONE_UA },
    ctx()
  );

describe("VAPID settings", () => {
  it("is off without keys and ignores .env.example placeholders", () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "YOUR_VAPID_PRIVATE_KEY_HERE");
    expect(vapidConfig()).toBeNull();
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    expect(vapidConfig()).toBeNull();
  });

  it("uses the app's https address as the subject, never localhost", () => {
    expect(vapidConfig()).toEqual({
      subject: "https://cm.example.com",
      publicKey: "test-public-key",
      privateKey: "test-private-key"
    });
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3600");
    expect(vapidConfig()!.subject).toBeNull();
    vi.stubEnv("VAPID_SUBJECT", "mailto:owner@example.com");
    expect(vapidConfig()!.subject).toBe("mailto:owner@example.com");
  });

  it("falls back to the public key the browser gets", () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "client-key");
    expect(vapidConfig()!.publicKey).toBe("client-key");
  });
});

describe("devices", () => {
  it("names devices from the user agent", () => {
    expect(deviceLabel(IPHONE_UA)).toBe("iPhone");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141")).toBe("Windows");
    expect(deviceLabel(undefined)).toBe("this device");
  });

  it("saves a device once, refreshes it, and never logs its keys", async () => {
    expect((await A.pushStatus.run({ userId: USER, endpoint: ENDPOINT }, ctx())).thisDevice).toBe(
      false
    );
    expect(await subscribePhone()).toEqual({ device: "iPhone", created: true });
    expect(await subscribePhone()).toEqual({ device: "iPhone", created: false });
    expect(await subscriptions()).toHaveLength(1);

    const status = await A.pushStatus.run({ userId: USER, endpoint: ENDPOINT }, ctx());
    expect(status).toEqual({
      configured: true,
      devices: 1,
      thisDevice: true,
      preferences: { daily: true, replies: true, approvals: true }
    });
    expect(await logOf("savePushSubscription")).toEqual([
      "Turned on notifications on iPhone",
      "Refreshed notifications on iPhone"
    ]);
    const log = JSON.stringify(await db.select().from(t.activityLog));
    expect(log).not.toContain(ENDPOINT);
    expect(log).not.toContain(KEYS.auth);
  });

  it("refuses an endpoint that is not https", async () => {
    await expect(
      A.savePushSubscription.run(
        { userId: USER, endpoint: "http://push.example.com/x", keys: KEYS },
        ctx()
      )
    ).rejects.toThrow();
  });

  it("turns a device off", async () => {
    expect(await A.removePushSubscription.run({ userId: USER, endpoint: ENDPOINT }, ctx())).toEqual(
      { removed: 1, device: "iPhone" }
    );
    expect(await subscriptions()).toHaveLength(0);
    expect((await logOf("removePushSubscription")).at(-1)).toBe(
      "Turned off notifications on iPhone"
    );
  });
});

describe("preferences", () => {
  it("are all on by default and toggle one kind at a time", async () => {
    expect(await A.setPushPreferences.run({ userId: USER, replies: false }, ctx())).toEqual({
      daily: true,
      replies: false,
      approvals: true
    });
    expect((await A.pushStatus.run({ userId: USER }, ctx())).preferences.replies).toBe(false);
    await A.setPushPreferences.run({ userId: USER, replies: true }, ctx());
    expect(await logOf("setPushPreferences")).toEqual([
      "Turned off reply notifications",
      "Turned on reply notifications"
    ]);
  });
});

describe("sending", () => {
  beforeEach(async () => {
    await db.delete(t.pushSubscriptions);
    await db.delete(t.approvals);
    await db.delete(t.notificationReads);
    await subscribePhone();
  });

  it("pushes a new approval right away, with the bell's unread count as the badge", async () => {
    await db
      .insert(t.approvals)
      .values({
        action: "x",
        payload: {},
        summary: "Older one",
        createdAt: new Date(Date.now() - DAY)
      });
    const approval = await A.requestApproval.run(
      { action: "sendEmail", summary: "Email Jordan about the pilot", payload: {} },
      ctx()
    );

    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [sub, body, options] = sendNotification.mock.calls[0] as [any, string, any];
    expect(sub).toEqual({ endpoint: ENDPOINT, keys: KEYS });
    expect(JSON.parse(body)).toEqual({
      title: "Waiting for your approval",
      body: "Email Jordan about the pilot",
      url: "/today#approvals",
      tag: `approval-${approval.id}`,
      badge: 2
    });
    expect(options).toMatchObject({
      urgency: "high",
      vapidDetails: {
        subject: "https://cm.example.com",
        publicKey: "test-public-key",
        privateKey: "test-private-key"
      }
    });
    const { unread } = await A.listNotifications.run({ userId: USER }, ctx());
    expect(payloads()[0].badge).toBe(unread);
  });

  it("lowers the badge as items are read", async () => {
    const a = await A.requestApproval.run({ action: "x", summary: "First", payload: {} }, ctx());
    await A.markNotificationsRead.run({ userId: USER, itemIds: [`approval:${a.id}`] }, ctx());
    await A.requestApproval.run({ action: "x", summary: "Second", payload: {} }, ctx());
    expect(payloads().map((p) => p.badge)).toEqual([1, 1]);
    // Everything read: the badge payload is 0, which clears the icon.
    const { items } = await A.listNotifications.run({ userId: USER }, ctx());
    await A.markNotificationsRead.run({ userId: USER, itemIds: items.map((i) => i.id) }, ctx());
    await sendPush(db, "test", { title: "t", body: "b", url: "/" });
    expect(payloads().at(-1)!.badge).toBe(0);
  });

  it("respects a kind turned off", async () => {
    await A.setPushPreferences.run({ userId: USER, approvals: false }, ctx());
    await A.requestApproval.run({ action: "x", summary: "Quiet", payload: {} }, ctx());
    expect(sendNotification).not.toHaveBeenCalled();
    await A.setPushPreferences.run({ userId: USER, approvals: true }, ctx());
  });

  it("does nothing when VAPID keys are not set, and the write still lands", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const a = await A.requestApproval.run({ action: "x", summary: "No keys", payload: {} }, ctx());
    expect(a.status).toBe("pending");
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("deletes devices the push service reports gone (404/410) and keeps others", async () => {
    await A.savePushSubscription.run(
      {
        userId: USER,
        endpoint: "https://fcm.googleapis.com/fcm/send/mac",
        keys: KEYS,
        userAgent: "Macintosh"
      },
      ctx()
    );
    await A.savePushSubscription.run(
      {
        userId: USER,
        endpoint: "https://fcm.googleapis.com/fcm/send/flaky",
        keys: KEYS,
        userAgent: "Windows"
      },
      ctx()
    );
    sendNotification.mockImplementation(async (sub: any) => {
      if (sub.endpoint === ENDPOINT) throw Object.assign(new Error("Gone"), { statusCode: 410 });
      if (sub.endpoint.endsWith("/mac"))
        throw Object.assign(new Error("Not found"), { statusCode: 404 });
      throw Object.assign(new Error("Server error"), { statusCode: 500 });
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sendPush(db, "test", { title: "t", body: "b", url: "/" });
    errors.mockRestore();

    expect(result).toEqual({ sent: 0, failed: 1, removed: 2 });
    expect((await subscriptions()).map((s) => s.device)).toEqual(["Windows"]);
    expect((await logOf("prunePushSubscriptions")).at(-1)).toMatch(
      /^Removed 2 devices that no longer accept notifications \((iPhone, Mac|Mac, iPhone)\)$/
    );
  });

  it("a failing push never undoes the approval", async () => {
    sendNotification.mockRejectedValue(new Error("network down"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const a = await A.requestApproval.run(
      { action: "x", summary: "Still saved", payload: {} },
      ctx()
    );
    errors.mockRestore();
    const [row] = await db.select().from(t.approvals).where(eq(t.approvals.id, a.id));
    expect(row.summary).toBe("Still saved");
  });
});

describe("Gmail replies", () => {
  const GMAIL = "gmail.googleapis.com/gmail/v1/users/me";
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  const message = (id: string, from: string, at: number, labels: string[]) => ({
    id,
    threadId: "thread-lena",
    labelIds: labels,
    internalDate: String(at),
    payload: { headers: [{ name: "From", value: from }] }
  });

  beforeAll(async () => {
    await db.insert(t.accounts).values({
      id: "acc1",
      accountId: "google-sub",
      providerId: "google",
      userId: USER,
      scope: ["openid", "email", "profile", ...GOOGLE_SCOPES].join(" "),
      updatedAt: new Date()
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = new URL(input);
        if (url.pathname.endsWith("/profile")) return json({ emailAddress: ME });
        if (url.host + url.pathname === `${GMAIL}/threads/thread-lena`) {
          return json({
            messages: [
              message("s", `Simone <${ME}>`, Date.now() - 2 * DAY, ["SENT"]),
              message("r", "Lena <lena@soliome.com>", Date.now() - DAY, ["INBOX"])
            ]
          });
        }
        return new Response("{}", { status: 404 });
      })
    );
  });

  it("pushes as soon as the reply check moves a task to replied", async () => {
    await db.delete(t.pushSubscriptions);
    await subscribePhone();
    const project = await A.createProject.run({ name: "Soliome" }, ctx());
    const task = await A.createTask.run(
      { title: "Ask Lena about Soliome", status: "waiting", projectId: project.id },
      ctx()
    );
    await db.update(t.tasks).set({ emailThreadId: "thread-lena" }).where(eq(t.tasks.id, task.id));

    const result = await A.checkGmailReplies.run({}, ctx());
    expect(result.replied.map((r) => r.title)).toEqual(["Ask Lena about Soliome"]);
    expect(payloads()).toEqual([
      expect.objectContaining({
        title: "Reply arrived",
        body: "Ask Lena about Soliome",
        url: `/projects?p=${project.id}`,
        tag: "replies"
      })
    ]);

    // Nothing new on the next check: no push.
    sendNotification.mockClear();
    await A.checkGmailReplies.run({}, ctx());
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("groups several replies into one push", () => {
    expect(
      replyPush([
        { title: "A", projectId: null },
        { title: "B", projectId: "p" }
      ])
    ).toEqual({
      title: "2 replies arrived",
      body: "A, B",
      url: "/projects?view=tasks",
      tag: "replies"
    });
    expect(approvalPush({ id: "1", summary: "x".repeat(300) }).body).toHaveLength(180);
  });
});

describe("daily summary push", () => {
  const now = new Date("2026-10-03T19:00:00Z");
  const noEmail: Transport = {
    via: "gmail",
    send: async () => {
      throw new Error("no email expected");
    }
  };

  beforeEach(async () => {
    await db.delete(t.pushSubscriptions);
    await db.delete(t.approvals);
    await db.delete(t.tasks);
    await db.delete(t.userSettings);
    await subscribePhone();
  });

  it("goes out from the same daily job, opens Today, and moves the 'new since' mark", async () => {
    await db.insert(t.approvals).values({
      action: "x",
      payload: {},
      summary: "Approve the deck",
      createdAt: new Date(now.getTime() - 3_600_000)
    });
    const result = await runDailySummary({ db, now, transport: noEmail });
    expect(result).toEqual({ ok: true, sent: true, via: "push", items: 1, pushed: 1 });
    expect(payloads()).toEqual([
      {
        title: "Your day in Cultured Matter",
        body: "1 approval waiting",
        url: "/today",
        tag: "daily-summary",
        badge: 1
      }
    ]);
    expect(sendNotification.mock.calls[0][2]).toMatchObject({ topic: "daily-summary" });
    expect((await A.getUserSettings.run({ userId: USER }, ctx())).lastSummaryAt).toEqual(now);
    expect((await logOf("recordDailySummary")).at(-1)).toBe(
      "Sent the daily summary (1 item) via push to 1 device"
    );

    // The next morning, nothing new: no push.
    sendNotification.mockClear();
    expect(
      await runDailySummary({ db, now: new Date(now.getTime() + DAY), transport: noEmail })
    ).toEqual({ ok: true, sent: false, skipped: "Nothing new" });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sends both the email and the push when both are on", async () => {
    await A.setDailyEmail.run({ userId: USER, enabled: true }, ctx());
    await db
      .insert(t.approvals)
      .values({ action: "x", payload: {}, summary: "Approve it", createdAt: now });
    const sent: string[] = [];
    const result = await runDailySummary({
      db,
      now: new Date(now.getTime() + 60_000),
      transport: { via: "gmail", send: async (e) => void sent.push(e.subject) }
    });
    expect(result).toMatchObject({ ok: true, sent: true, via: "gmail", pushed: 1 });
    expect(sent).toHaveLength(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect((await logOf("recordDailySummary")).at(-1)).toBe(
      "Sent the daily summary (1 item) via Gmail and push to 1 device"
    );
  });

  it("skips the push when the daily kind is off, and does nothing when email is off too", async () => {
    await A.setPushPreferences.run({ userId: USER, daily: false }, ctx());
    await db
      .insert(t.approvals)
      .values({ action: "x", payload: {}, summary: "Approve it", createdAt: now });
    expect(await runDailySummary({ db, now, transport: noEmail })).toEqual({
      ok: true,
      sent: false,
      skipped: "Daily email is off"
    });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("summarises counts in one line", () => {
    const item = { title: "t", detail: null, href: "/" };
    expect(
      composeSummaryPush({
        since: now,
        newGrants: [item],
        newGrantsTotal: 3,
        closingGrants: [item, item],
        radar: {
          title: "New on Radar",
          detail: "4 new companies since your last visit",
          href: "/radar"
        },
        replies: [item],
        approvals: [],
        hasNews: true
      }).body
    ).toBe(
      "3 new grants · 2 grants closing this week · 4 new companies since your last visit · 1 reply"
    );
  });
});

// ---------------------------------------------------------------- Service worker

describe("service worker push handlers", () => {
  const source = readFileSync(fileURLToPath(new URL("../public/sw.js", import.meta.url)), "utf8");

  function load() {
    const listeners: Record<string, (event: any) => void> = {};
    const shown: { title: string; options: any }[] = [];
    const badges: (number | "cleared")[] = [];
    const opened: string[] = [];
    const self = {
      location: { origin: "https://cm.test" },
      addEventListener: (type: string, fn: (event: any) => void) => (listeners[type] = fn),
      registration: {
        showNotification: async (title: string, options: any) => void shown.push({ title, options })
      },
      navigator: {
        setAppBadge: async (n: number) => void badges.push(n),
        clearAppBadge: async () => void badges.push("cleared")
      },
      clients: {
        windows: [] as any[],
        matchAll: async () => self.clients.windows,
        openWindow: async (url: string) => void opened.push(url)
      }
    };
    vm.runInContext(source, vm.createContext({ URL, self }));
    const dispatch = async (type: string, event: any) => {
      let done: Promise<unknown> = Promise.resolve();
      listeners[type]({ ...event, waitUntil: (p: Promise<unknown>) => (done = p) });
      await done;
    };
    return { self, dispatch, shown, badges, opened };
  }

  const pushEvent = (data: unknown) => ({
    data: {
      json: () => (typeof data === "string" ? JSON.parse(data) : data),
      text: () => String(data)
    }
  });

  it("always shows a notification and sets the icon badge", async () => {
    const sw = load();
    await sw.dispatch(
      "push",
      pushEvent({
        title: "Reply arrived",
        body: "Ask Lena",
        url: "/projects?p=1",
        tag: "replies",
        badge: 3
      })
    );
    expect(sw.shown).toEqual([
      {
        title: "Reply arrived",
        options: {
          body: "Ask Lena",
          icon: "/icon/192",
          tag: "replies",
          data: { url: "/projects?p=1" }
        }
      }
    ]);
    expect(sw.badges).toEqual([3]);

    // Unreadable or empty payloads still show something (iOS requires it); 0 clears the badge.
    await sw.dispatch("push", pushEvent("not json"));
    await sw.dispatch("push", { data: null });
    await sw.dispatch("push", pushEvent({ title: "x", badge: 0 }));
    expect(sw.shown.map((s) => s.title)).toEqual([
      "Reply arrived",
      "Cultured Matter",
      "Cultured Matter",
      "x"
    ]);
    expect(sw.shown[1].options.body).toBe("not json");
    expect(sw.badges).toEqual([3, "cleared"]);
  });

  it("only links to this site", async () => {
    const sw = load();
    await sw.dispatch("push", pushEvent({ title: "x", url: "https://evil.test/phish" }));
    expect(sw.shown[0].options.data.url).toBe("/today");
  });

  it("opens the linked page in the open app window, or a new one", async () => {
    const sw = load();
    const notification = { data: { url: "/today#approvals" }, close: vi.fn() };
    await sw.dispatch("notificationclick", { notification });
    expect(notification.close).toHaveBeenCalled();
    expect(sw.opened).toEqual(["/today#approvals"]);

    const focus = vi.fn();
    const navigate = vi.fn(async () => ({ focus }));
    sw.self.clients.windows = [{ url: "https://cm.test/radar", navigate, focus: vi.fn() }];
    await sw.dispatch("notificationclick", { notification });
    expect(navigate).toHaveBeenCalledWith("/today#approvals");
    expect(focus).toHaveBeenCalled();
    expect(sw.opened).toHaveLength(1);
  });
});
