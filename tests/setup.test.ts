import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as A from "@/actions";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import { freshDb } from "./test-db";

let db: Database;
let cleanup: () => void;
const ctx = () => ({ db });

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
});
afterAll(() => cleanup());

const GRANTED = [
  "openid email profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/contacts.other.readonly"
].join(" ");

describe("setupStatus", () => {
  it("starts with nothing set up", async () => {
    expect(await A.setupStatus.run({}, ctx())).toEqual({
      linkedin: { done: false, contacts: 0 },
      google: { done: false },
      iphone: { done: false, lastCaptureAt: null },
      done: 0,
      total: 3
    });
  });

  it("counts LinkedIn only from LinkedIn contacts", async () => {
    await db.insert(t.contacts).values({ fullName: "Typed In", source: "manual" });
    expect((await A.setupStatus.run({}, ctx())).linkedin).toEqual({ done: false, contacts: 0 });

    await db.insert(t.contacts).values([
      {
        fullName: "Ada Lovelace",
        profileUrl: "https://linkedin.com/in/ada",
        source: "linkedin_csv"
      },
      {
        fullName: "Grace Hopper",
        profileUrl: "https://linkedin.com/in/grace",
        source: "linkedin_csv"
      }
    ]);
    const status = await A.setupStatus.run({}, ctx());
    expect(status.linkedin).toEqual({ done: true, contacts: 2 });
    expect(status.done).toBe(1);
  });

  it("counts the iPhone only once something was captured from it", async () => {
    await A.createCapture.run({ body: "Typed on the web" }, ctx());
    expect((await A.setupStatus.run({}, ctx())).iphone).toEqual({
      done: false,
      lastCaptureAt: null
    });

    await A.createCapture.run({ body: "Said into Siri", source: "iphone" }, ctx());
    const { iphone } = await A.setupStatus.run({}, ctx());
    expect(iphone.done).toBe(true);
    expect(iphone.lastCaptureAt).toBeInstanceOf(Date);
    expect(Date.now() - iphone.lastCaptureAt!.getTime()).toBeLessThan(60_000);
  });

  it("counts Google once it granted Gmail and Contacts", async () => {
    await db.insert(t.users).values({ id: "u1", name: "Simone", email: "simone@example.com" });
    await db.insert(t.accounts).values({
      id: "acc1",
      accountId: "google-sub",
      providerId: "google",
      userId: "u1",
      scope: "openid,email,profile",
      updatedAt: new Date()
    });
    expect((await A.setupStatus.run({}, ctx())).google).toEqual({ done: false });

    await db.update(t.accounts).set({ scope: GRANTED }).where(eq(t.accounts.id, "acc1"));
    const status = await A.setupStatus.run({}, ctx());
    expect(status.google).toEqual({ done: true });
    expect(status.done).toBe(3);
  });
});
