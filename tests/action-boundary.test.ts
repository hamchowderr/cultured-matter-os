import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";

// refresh() and after() only work inside a real server action; record the calls instead.
const refresh = vi.hoisted(() => vi.fn());
const after = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ refresh }));
vi.mock("next/server", () => ({ after }));
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session", () => ({ getSession }));

import { ActionError, defineAction, toResult } from "@/actions/define";
import type { Database } from "@/db";
import { freshDb } from "./test-db";

let db: Database;
let cleanup: () => void;

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
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

describe("server-action boundary", () => {
  it("refreshes the page after a write, in the same response", async () => {
    expect(await toResult(() => write.run({}, { db }))).toEqual({ ok: true, data: { ok: true } });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh for a read, so page renders can read through it", async () => {
    expect(await toResult(() => read.run({}, { db }))).toEqual({ ok: true, data: { n: 1 } });
    expect(refresh).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("does not refresh when the write is refused", async () => {
    const result = await toResult(() => write.run({ fail: true }, { db }));
    expect(result).toMatchObject({ ok: false, error: { code: "invalid" } });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not refresh for a signed-out call", async () => {
    getSession.mockResolvedValue(null);
    const result = await toResult(() => write.run({}, { db }));
    expect(result).toMatchObject({ ok: false, error: { code: "unauthorized" } });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("hands the follow-up step to after() instead of awaiting it", async () => {
    followUp.mockClear();
    await toResult(() => write.run({}, { db }));
    expect(followUp).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledTimes(1);
    await after.mock.calls[0][0]();
    expect(followUp).toHaveBeenCalledTimes(1);
  });

  it("runs the follow-up step directly outside a server action (scripts, cron, tests)", async () => {
    followUp.mockClear();
    await write.run({}, { db });
    expect(followUp).toHaveBeenCalledTimes(1);
    expect(after).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
