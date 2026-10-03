import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import * as A from "@/actions";
import * as S from "@/actions/server";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import { ACCOUNT_NOT_ALLOWED, isAllowedEmail, parseAllowedEmails } from "@/lib/allowed-emails";
import { freshDb } from "./test-db";

// The real session lookup needs a Next.js request; each test decides what it returns.
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session", () => ({ getSession }));

// lib/auth binds to `db` from @/db when it loads; point that at this file's test database.
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

describe("allowed emails", () => {
  const list = "simone@culturedmatter.com, Other@Example.org";

  it("allows a listed address", () => {
    expect(isAllowedEmail("simone@culturedmatter.com", list)).toBe(true);
  });

  it("ignores case and surrounding spaces", () => {
    expect(isAllowedEmail("  SIMONE@CulturedMatter.com ", list)).toBe(true);
    expect(isAllowedEmail("other@example.org", list)).toBe(true);
  });

  it("refuses an address that isn't listed", () => {
    expect(isAllowedEmail("someone@else.com", list)).toBe(false);
    expect(isAllowedEmail("", list)).toBe(false);
    expect(isAllowedEmail(null, list)).toBe(false);
  });

  it("refuses everyone when the list is empty or missing", () => {
    expect(parseAllowedEmails("")).toEqual([]);
    expect(parseAllowedEmails(" , ,")).toEqual([]);
    expect(isAllowedEmail("simone@culturedmatter.com", "")).toBe(false);
    expect(isAllowedEmail("simone@culturedmatter.com", undefined)).toBe(false);
  });
});

describe("server actions", () => {
  afterEach(() => {
    getSession.mockReset();
    vi.restoreAllMocks();
  });

  it("reject calls without a session and never run the action", async () => {
    getSession.mockResolvedValue(null);
    const read = vi.spyOn(A.searchGrants, "run");
    const write = vi.spyOn(A.createCapture, "run");

    expect(await S.searchGrants({})).toEqual({
      ok: false,
      error: { code: "unauthorized", message: "Please sign in again." }
    });
    expect(await S.createCapture({ body: "anonymous note" })).toMatchObject({
      ok: false,
      error: { code: "unauthorized" }
    });
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("run the action when signed in", async () => {
    getSession.mockResolvedValue({ user: { id: "u1", email: "simone@culturedmatter.com" } });
    const run = vi.spyOn(A.searchGrants, "run").mockResolvedValue([] as never);

    expect(await S.searchGrants({})).toEqual({ ok: true, data: [] });
    expect(run).toHaveBeenCalledOnce();
  });
});

describe("auth database hooks", () => {
  let db: Database;
  let cleanup: () => void;
  let hooks: NonNullable<Awaited<typeof import("@/lib/auth")>["auth"]["options"]["databaseHooks"]>;
  const env = { ...process.env };

  beforeAll(async () => {
    ({ db, cleanup } = await freshDb());
    testDb.current = db;
    process.env.ALLOWED_EMAILS = "simone@culturedmatter.com";
    process.env.BETTER_AUTH_SECRET = "test-only-secret-not-used-anywhere-else-000000";
    hooks = (await import("@/lib/auth")).auth.options.databaseHooks!;
  });
  afterAll(() => {
    process.env = env;
    cleanup();
  });

  const createUser = (email: string) =>
    hooks.user!.create!.before!({ email, name: "", emailVerified: true } as never);

  it("signs in with Google only, asking for offline access and the Gmail and Contacts scopes", async () => {
    const { auth } = await import("@/lib/auth");
    const { GOOGLE_SCOPES } = await import("@/lib/google-scopes");
    expect(Object.keys(auth.options.socialProviders!)).toEqual(["google"]);
    expect(auth.options.socialProviders!.google).toMatchObject({
      accessType: "offline",
      prompt: "select_account consent",
      scope: [...GOOGLE_SCOPES]
    });
  });

  it("refuses to create a user outside ALLOWED_EMAILS", async () => {
    await expect(createUser("someone@else.com")).rejects.toMatchObject({
      body: { code: ACCOUNT_NOT_ALLOWED }
    });
  });

  it("lets the allowed account through, in any case", async () => {
    await expect(createUser("Simone@CulturedMatter.com")).resolves.not.toBe(false);
  });

  it("refuses a new session for a user whose address is no longer allowed", async () => {
    const [kept] = await db
      .insert(t.users)
      .values({ id: "kept", name: "Simone", email: "simone@culturedmatter.com" })
      .returning();
    const [removed] = await db
      .insert(t.users)
      .values({ id: "removed", name: "Old", email: "old@culturedmatter.com" })
      .returning();
    const createSession = (userId: string) => hooks.session!.create!.before!({ userId } as never);

    await expect(createSession(kept.id)).resolves.not.toBe(false);
    await expect(createSession(removed.id)).rejects.toMatchObject({
      body: { code: ACCOUNT_NOT_ALLOWED }
    });
  });
});
