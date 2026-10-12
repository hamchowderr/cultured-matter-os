import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { firstUser } from "@/actions/preferences";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import { ownerEmail } from "@/lib/allowed-emails";
import { googleAccount } from "@/lib/google";
import { freshDb } from "./test-db";

let db: Database;
let cleanup: () => void;

// A tester's account, created first and used for Google most recently, and the owner's.
beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
  await db.insert(t.users).values([
    { id: "tester", name: "Tester", email: "tester@example.com", createdAt: new Date(1_000) },
    { id: "owner", name: "Simone", email: "Simone@SimonePaz.com", createdAt: new Date(2_000) }
  ]);
  await db.insert(t.accounts).values([
    {
      id: "acc-owner",
      accountId: "owner-sub",
      providerId: "google",
      userId: "owner",
      updatedAt: new Date(3_000)
    },
    {
      id: "acc-tester",
      accountId: "tester-sub",
      providerId: "google",
      userId: "tester",
      updatedAt: new Date(4_000)
    }
  ]);
});
afterAll(() => cleanup());
afterEach(() => vi.unstubAllEnvs());

describe("ownerEmail", () => {
  it("normalizes OWNER_EMAIL and treats blank as unset", () => {
    expect(ownerEmail(" Simone@SimonePaz.com ")).toBe("simone@simonepaz.com");
    expect(ownerEmail("  ")).toBeNull();
    expect(ownerEmail(undefined)).toBeNull();
  });
});

describe("with OWNER_EMAIL set", () => {
  it("uses the owner's Google account even when a tester signed in more recently", async () => {
    vi.stubEnv("OWNER_EMAIL", "simone@simonepaz.com");
    expect((await googleAccount(db))?.account.id).toBe("acc-owner");
  });

  it("sends the daily summary to the owner, not the first account created", async () => {
    vi.stubEnv("OWNER_EMAIL", "simone@simonepaz.com");
    expect((await firstUser(db))?.id).toBe("owner");
  });

  it("finds no Google account rather than a tester's when the owner hasn't signed in", async () => {
    vi.stubEnv("OWNER_EMAIL", "nobody@example.com");
    expect(await googleAccount(db)).toBeNull();
    expect(await firstUser(db)).toBeNull();
  });
});

describe("without OWNER_EMAIL", () => {
  it("keeps the earlier fallbacks", async () => {
    vi.stubEnv("OWNER_EMAIL", "");
    expect((await googleAccount(db))?.account.id).toBe("acc-tester");
    expect((await firstUser(db))?.id).toBe("tester");
  });
});
