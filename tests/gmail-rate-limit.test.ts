import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Better Auth hands out the stored Google token; no real Google calls in tests.
const getAccessToken = vi.hoisted(() => vi.fn(async () => ({ accessToken: "test-token" })));
vi.mock("@/lib/auth", () => ({ auth: { api: { getAccessToken } } }));

import * as A from "@/actions";
import type { GmailMessage } from "@/actions/gmail";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import { GOOGLE_SCOPES } from "@/lib/google-scopes";
import {
  backoffMs,
  classifyGoogleError,
  GmailPacer,
  GOOGLE_RETRIES,
  googleTiming
} from "@/lib/google";
import {
  MAX_SLOW_DOWNS,
  runGmailSync,
  SLOW_DOWN_WAIT_MS,
  type SyncStep
} from "@/lib/gmail-sync-run";
import { freshDb } from "./test-db";

// Gmail's usage limits (cmos-0ie): a quota error is "slow down", never "not connected"; the sync
// backs off, keeps what it read, and continues where it stopped.

let db: Database;
let cleanup: () => void;
const ctx = () => ({ db });

const ME = "simone@simonepaz.com";
const GMAIL = "gmail.googleapis.com/gmail/v1/users/me";
const PEOPLE = "people.googleapis.com/v1";

type Call = { url: URL; method: string };
let calls: Call[] = [];
let routes: Record<string, (call: Call) => Response>;
let sleeps: number[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// The 403 the owner's sync got: google.rpc PERMISSION_DENIED with a quota ErrorInfo.
const QUOTA_403 = {
  error: {
    code: 403,
    status: "PERMISSION_DENIED",
    message:
      "Quota exceeded for quota metric 'Queries' and limit 'Queries per minute per user' of service 'gmail.googleapis.com' for consumer 'project_number:189138741659'.",
    errors: [{ reason: "rateLimitExceeded", domain: "usageLimits", message: "Quota exceeded" }],
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        reason: "RATE_LIMIT_EXCEEDED",
        domain: "googleapis.com"
      }
    ]
  }
};
const USER_RATE_403 = {
  error: {
    code: 403,
    message: "User Rate Limit Exceeded",
    errors: [{ reason: "userRateLimitExceeded", domain: "usageLimits" }]
  }
};
const SCOPES_403 = {
  error: {
    code: 403,
    status: "PERMISSION_DENIED",
    message: "Request had insufficient authentication scopes.",
    errors: [{ reason: "insufficientPermissions", domain: "global" }]
  }
};

const msg = (id: string, from: string, daysAgo: number): GmailMessage => ({
  id,
  threadId: `t-${id}`,
  labelIds: ["INBOX"],
  internalDate: String(Date.now() - daysAgo * 86_400_000),
  payload: {
    headers: [
      { name: "From", value: from },
      { name: "To", value: ME },
      { name: "Subject", value: `About ${id}` }
    ]
  }
});

beforeAll(async () => {
  googleTiming.sleep = async (ms) => {
    sleeps.push(ms);
  };
  googleTiming.random = () => 0.5;
  ({ db, cleanup } = await freshDb());
  await db.insert(t.users).values({ id: "u1", name: "Simone", email: ME });
  await db.insert(t.accounts).values({
    id: "acc1",
    accountId: "google-sub",
    providerId: "google",
    userId: "u1",
    scope: ["openid", "email", "profile", ...GOOGLE_SCOPES].join(" "),
    updatedAt: new Date()
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      const call = { url, method: init?.method ?? "GET" };
      calls.push(call);
      const handler = routes[url.host + url.pathname];
      return handler ? handler(call) : json({ error: { code: 404 } }, 404);
    })
  );
});
afterAll(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const MESSAGES = ["a1", "a2", "a3", "a4", "a5", "a6"].map((id, i) =>
  msg(id, `Person ${id} <${id}@example.org>`, i + 1)
);

beforeEach(async () => {
  calls = [];
  sleeps = [];
  await db.delete(t.gmailSync);
  await db.delete(t.contactEmails);
  await db.delete(t.contacts);
  routes = {
    [`${GMAIL}/profile`]: () => json({ emailAddress: ME }),
    [`${PEOPLE}/people/me/connections`]: () => json({ connections: [] }),
    [`${PEOPLE}/otherContacts`]: () => json({ otherContacts: [] }),
    [`${GMAIL}/messages`]: () => json({ messages: MESSAGES.map((m) => ({ id: m.id })) })
  };
  for (const m of MESSAGES) routes[`${GMAIL}/messages/${m.id}`] = () => json(m);
});

const reads = (id: string) => calls.filter((c) => c.url.pathname.endsWith(`/messages/${id}`));

describe("Telling Gmail's usage limits from a lost connection", () => {
  it("classifies 401, quota 403s, permission 403s, 429 and 5xx", () => {
    expect(classifyGoogleError(401, null)).toBe("auth");
    expect(classifyGoogleError(403, QUOTA_403)).toBe("rate");
    expect(classifyGoogleError(403, USER_RATE_403)).toBe("rate");
    expect(
      classifyGoogleError(403, { error: { errors: [{ reason: "dailyLimitExceeded" }] } })
    ).toBe("daily");
    expect(classifyGoogleError(403, SCOPES_403)).toBe("auth");
    expect(classifyGoogleError(403, { error: { errors: [{ reason: "domainPolicy" }] } })).toBe(
      "auth"
    );
    expect(classifyGoogleError(429, null)).toBe("rate");
    expect(classifyGoogleError(503, null)).toBe("server");
  });

  it("backs off exponentially with jitter, capped, or as long as Retry-After says", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => backoffMs(n, null))).toEqual([
      1500, 2500, 4500, 8500, 16_500, 32_000, 32_000
    ]);
    expect(backoffMs(0, "7")).toBe(7000);
  });

  it("paces Gmail calls under the per-user quota", async () => {
    let clock = 0;
    const realNow = googleTiming.now;
    const realSleep = googleTiming.sleep;
    const waits: number[] = [];
    googleTiming.now = () => clock;
    googleTiming.sleep = async (ms) => {
      waits.push(ms);
      clock += ms;
    };
    try {
      // 6,000 units a minute: a 20-unit read every 200 ms.
      const pacer = new GmailPacer(6000);
      for (let i = 0; i < 4; i++) await pacer.take(20);
      expect(waits).toEqual([200, 200, 200]);
    } finally {
      googleTiming.now = realNow;
      googleTiming.sleep = realSleep;
    }
  });

  it("a quota 403 is retried after a backoff and the sync completes, never 'not connected'", async () => {
    let refused = 0;
    routes[`${GMAIL}/messages/a2`] = () =>
      refused++ < 2 ? json(QUOTA_403, 403) : json(MESSAGES[1]);
    const r = await A.syncGoogle.run({}, ctx());
    expect(r).toMatchObject({ done: true, read: 6, total: 6, emailsLogged: 6, slowedDown: false });
    expect(reads("a2")).toHaveLength(3);
    // The two backoffs (2^0 s and 2^1 s, plus the jitter), among the pacing waits.
    expect(sleeps).toEqual(expect.arrayContaining([1500, 2500]));
  });

  it("a 401 or a permission 403 asks to connect again, without retrying", async () => {
    routes[`${GMAIL}/messages`] = () => json(SCOPES_403, 403);
    await expect(A.syncGoogle.run({}, ctx())).rejects.toMatchObject({
      code: "google_not_connected"
    });
    expect(calls.filter((c) => c.url.pathname.endsWith("/users/me/messages"))).toHaveLength(1);

    routes[`${GMAIL}/profile`] = () => json({ error: { code: 401 } }, 401);
    await expect(A.syncGoogle.run({}, ctx())).rejects.toMatchObject({
      code: "google_not_connected"
    });
  });

  it("a quota that never lifts while listing is reported as 'slow down'", async () => {
    routes[`${GMAIL}/messages`] = () => json(USER_RATE_403, 403);
    await expect(A.syncGoogle.run({}, ctx())).rejects.toMatchObject({ code: "rate_limited" });
    // The first try and every retry.
    expect(calls.filter((c) => c.url.pathname.endsWith("/users/me/messages"))).toHaveLength(
      GOOGLE_RETRIES + 1
    );
  });
});

describe("Saving what was read and continuing", () => {
  it("keeps what it read when Gmail keeps refusing, and the next sync continues from there", async () => {
    // a4 is refused through every retry: the batch stops short.
    routes[`${GMAIL}/messages/a4`] = () => json(QUOTA_403, 403);
    const first = await A.syncGoogle.run({}, ctx());
    expect(first.slowedDown).toBe(true);
    expect(first.done).toBe(false);
    expect(first.total).toBe(6);
    expect(first.read).toBeGreaterThanOrEqual(3);
    // What was read is saved.
    expect(await db.select().from(t.contactEmails)).toHaveLength(first.read);
    const [state] = await db.select().from(t.gmailSync);
    expect(state.pending).toContain("a4");
    expect(state.pending).toHaveLength(6 - first.read);

    // Gmail is happy again: the next call reads only what is left, without listing again.
    routes[`${GMAIL}/messages/a4`] = () => json(MESSAGES[3]);
    calls = [];
    const second = await A.syncGoogle.run({}, ctx());
    expect(second).toMatchObject({ done: true, read: 6, total: 6, slowedDown: false });
    expect(calls.filter((c) => c.url.pathname.endsWith("/users/me/messages"))).toHaveLength(0);
    for (const id of ["a1", "a2", "a3"]) expect(reads(id)).toHaveLength(0);
    expect(await db.select().from(t.contactEmails)).toHaveLength(6);
    const [after] = await db.select().from(t.gmailSync);
    expect(after.pending).toEqual([]);
  });

  it("a message deleted since it was listed is skipped, not retried forever", async () => {
    delete routes[`${GMAIL}/messages/a3`];
    const r = await A.syncGoogle.run({}, ctx());
    expect(r).toMatchObject({ done: true, read: 6, total: 6, emailsLogged: 5 });
  });
});

describe("runGmailSync (the People page's loop)", () => {
  const step = (s: Partial<SyncStep>): { ok: true; data: SyncStep } => ({
    ok: true,
    data: {
      created: 0,
      emailsLogged: 0,
      read: 0,
      total: 3,
      done: false,
      slowedDown: false,
      ...s
    }
  });

  it("calls the sync until done, adding up and reporting progress", async () => {
    const results = [
      step({ created: 2, emailsLogged: 5, read: 1 }),
      step({ created: 1, emailsLogged: 2, read: 2, slowedDown: true }),
      { ok: false as const, error: { code: "rate_limited", message: "slow down" } },
      step({ emailsLogged: 1, read: 3, done: true })
    ];
    const progress: [number, number][] = [];
    const waits: number[] = [];
    let slowed = 0;
    const run = await runGmailSync(async () => results.shift()!, {
      onProgress: (read, total) => progress.push([read, total]),
      onSlowedDown: () => slowed++,
      wait: async (ms) => {
        waits.push(ms);
      }
    });
    expect(run).toEqual({ ok: true, created: 3, emailsLogged: 8 });
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3]
    ]);
    expect(slowed).toBe(2);
    expect(waits).toEqual([SLOW_DOWN_WAIT_MS, SLOW_DOWN_WAIT_MS]);
  });

  it("stops after too many slow-downs, keeping the totals and saying how to continue", async () => {
    const run = await runGmailSync(
      async () => step({ read: 1, slowedDown: true, emailsLogged: 1 }),
      {
        wait: async () => {}
      }
    );
    expect(run.ok).toBe(false);
    expect(run.emailsLogged).toBe(MAX_SLOW_DOWNS + 1);
    if (!run.ok) {
      expect(run.error.code).toBe("rate_limited");
      expect(run.error.message).toContain("press Sync Gmail again");
    }
  });

  it("stops at once when Google needs connecting again", async () => {
    const run = await runGmailSync(async () => ({
      ok: false,
      error: { code: "google_not_connected", message: "connect" }
    }));
    expect(run).toMatchObject({ ok: false, error: { code: "google_not_connected" } });
  });
});
