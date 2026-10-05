import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";

// refresh() and after() only work inside a real server action; record the calls instead.
const refresh = vi.hoisted(() => vi.fn());
const after = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ refresh }));
vi.mock("next/server", () => ({ after }));
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session", () => ({ getSession }));
// The server.ts wrappers use the app database; point it at this file's test database.
const testDb = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/db")>();
  return {
    ...mod,
    get db() {
      return testDb.current;
    }
  };
});

import { ActionError, defineAction, toResult } from "@/actions/define";
import * as S from "@/actions/server";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import { freshDb } from "./test-db";

let db: Database;
let cleanup: () => void;

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
  testDb.current = db;
  await db.insert(t.users).values({ id: "u1", name: "Simone", email: "simone@example.com" });
});
afterAll(() => cleanup());
beforeEach(() => {
  refresh.mockReset();
  after.mockReset();
  getSession.mockResolvedValue({ user: { id: "u1" } });
});

const followUp = vi.fn(async () => {});
const write = defineAction({
  name: "testWrite",
  description: "A write for the boundary tests.",
  kind: "write",
  input: z.object({ fail: z.boolean().default(false) }),
  output: z.object({ ok: z.boolean() }),
  async handler(input) {
    if (input.fail) throw new ActionError("invalid", "No");
    return { ok: true };
  },
  log: () => ({ entityType: "test", summary: "Tested" }),
  after: followUp
});
const read = defineAction({
  name: "testRead",
  description: "A read for the boundary tests.",
  kind: "read",
  input: z.object({}),
  output: z.object({ n: z.number() }),
  handler: async () => ({ n: 1 })
});

describe("refresh at the server-action boundary", () => {
  it("refreshes the page after an opted-in write", async () => {
    const result = await toResult(() => write.run({}, { db }), { refresh: true });
    expect(result).toEqual({ ok: true, data: { ok: true } });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh a write that did not opt in", async () => {
    await toResult(() => write.run({}, { db }));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not refresh for a read, so page renders can read through it", async () => {
    expect(await toResult(() => read.run({}, { db }))).toEqual({ ok: true, data: { n: 1 } });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not refresh when the write is refused", async () => {
    const result = await toResult(() => write.run({ fail: true }, { db }), { refresh: true });
    expect(result).toMatchObject({ ok: false, error: { code: "invalid" } });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not refresh for a signed-out call", async () => {
    getSession.mockResolvedValue(null);
    const result = await toResult(() => write.run({}, { db }), { refresh: true });
    expect(result).toMatchObject({ ok: false, error: { code: "unauthorized" } });
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("post-commit steps", () => {
  it("hands the step to ctx.defer instead of awaiting it", async () => {
    followUp.mockClear();
    const deferred: (() => Promise<void>)[] = [];
    await write.run({}, { db, defer: (task) => deferred.push(task) });
    expect(followUp).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(1);
    await deferred[0]();
    expect(followUp).toHaveBeenCalledTimes(1);
  });

  it("schedules the step before refresh(), so a refresh error cannot lose it", async () => {
    followUp.mockClear();
    const order: string[] = [];
    refresh.mockImplementation(() => {
      order.push("refresh");
      throw new Error("refresh failed");
    });
    const defer = (task: () => Promise<void>) => {
      order.push("defer");
      void task();
    };
    const result = await toResult(() => write.run({}, { db, defer }), { refresh: true });
    expect(result).toMatchObject({ ok: false });
    expect(order).toEqual(["defer", "refresh"]);
    expect(followUp).toHaveBeenCalledTimes(1);
  });

  it("awaits the step directly without ctx.defer (cron, scripts, tests)", async () => {
    followUp.mockClear();
    await write.run({}, { db });
    expect(followUp).toHaveBeenCalledTimes(1);
    expect(after).not.toHaveBeenCalled();
  });
});

describe("actions/server.ts wrappers", () => {
  it("refresh after a write that changes the page, and pass post-commit steps to after()", async () => {
    // requestApproval pushes to her phone after it commits. The push step must go to after().
    const r = await S.requestApproval({ action: "test", summary: "Check this", payload: {} });
    expect(r.ok).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("leave the refresh off for writes nothing on screen shows", async () => {
    expect((await S.markTourSeen({ tourId: "today", finished: true })).ok).toBe(true);
    expect((await S.setDailyEmail({ enabled: false })).ok).toBe(true);
    expect((await S.setPushPreferences({ daily: false })).ok).toBe(true);
    expect((await S.removePushSubscription({ endpoint: "https://push.example/x" })).ok).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("let the scope switch skip the refresh when its caller navigates", async () => {
    expect((await S.setWorkScope({ scope: "business", refresh: false })).ok).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
    expect((await S.setWorkScope({ scope: "all" })).ok).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
