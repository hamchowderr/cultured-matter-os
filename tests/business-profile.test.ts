import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as A from "@/actions";
import { loadBusinessContext } from "@/actions/business";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import {
  BUSINESS_CONTEXT_MAX,
  businessContext,
  COMPANY_DETAIL_FIELDS,
  emptyProfile
} from "@/lib/business-profile";
import { SEED_PROFILE, seedBusinessProfile } from "@/lib/business-seed";
import { freshDb } from "./test-db";

let db: Database;
let cleanup: () => void;
const ctx = () => ({ db });

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
});
afterAll(() => cleanup());

const profileLog = () =>
  db.select().from(t.activityLog).where(eq(t.activityLog.entityType, "business_profile"));

describe("business profile actions", () => {
  it("reads an empty profile before anything is saved, with every company detail waiting", async () => {
    const r = await A.getBusinessProfile.run({}, ctx());
    expect(r.profile).toMatchObject(emptyProfile());
    expect(r.profile.updatedAt).toBeNull();
    expect(r.waitingOn).toHaveLength(COMPANY_DETAIL_FIELDS.length);
    expect(r.waitingOn).toContain("EIN");
    expect(r.context).toBe("The business.");
  });

  it("updates fields, reports which changed, and reads them back", async () => {
    const r = await A.updateBusinessProfile.run(
      {
        name: "Cultured Matter",
        sectors: ["Beauty", "Fashion"],
        people: [{ name: "Simone Paz", role: "Founder" }],
        womanOwned: true
      },
      ctx()
    );
    expect(r.changed.sort()).toEqual(["name", "people", "sectors", "womanOwned"]);
    const read = await A.getBusinessProfile.run({}, ctx());
    expect(read.profile.name).toBe("Cultured Matter");
    expect(read.profile.sectors).toEqual(["Beauty", "Fashion"]);
    expect(read.profile.people).toEqual([{ name: "Simone Paz", role: "Founder" }]);
    expect(read.profile.womanOwned).toBe(true);
    expect(read.profile.updatedAt).toBeInstanceOf(Date);
    expect(read.waitingOn).not.toContain("woman-owned");
  });

  it("stores blank text as empty and leaves unchanged fields out of the change list", async () => {
    const r = await A.updateBusinessProfile.run(
      { name: "Cultured Matter", tagline: "  ", sectors: ["Beauty", "Fashion"] },
      ctx()
    );
    expect(r.changed).toEqual([]);
    expect(r.profile.tagline).toBeNull();
  });

  it("rejects unknown shapes", async () => {
    await expect(
      A.updateBusinessProfile.run({ sectors: "Beauty" } as never, ctx())
    ).rejects.toThrow();
  });
});

describe("the write log", () => {
  it("names the changed fields and never their values", async () => {
    const ein = "98-7654321";
    const uei = "ABCDEF123456";
    await A.updateBusinessProfile.run({ ein, samUei: uei, address: "1 Main St" }, ctx());
    const rows = await profileLog();
    const last = rows.at(-1)!;
    expect(last.action).toBe("updateBusinessProfile");
    expect(last.summary).toBe("Updated the business profile: EIN, SAM UEI, business address");
    expect(last.data).toEqual({ fields: ["ein", "samUei", "address"] });
    const all = JSON.stringify(rows);
    expect(all).not.toContain(ein);
    expect(all).not.toContain(uei);
    expect(all).not.toContain("1 Main St");
  });

  it("logs a save with no changes as such", async () => {
    await A.updateBusinessProfile.run({ ein: "98-7654321" }, ctx());
    const last = (await profileLog()).at(-1)!;
    expect(last.summary).toBe("Saved the business profile (no changes)");
    expect(last.data).toEqual({ fields: [] });
  });
});

describe("businessContext", () => {
  it("summarises the seeded profile in plain text under the limit", () => {
    const text = businessContext({ ...emptyProfile(), ...SEED_PROFILE });
    expect(text.length).toBeLessThan(BUSINESS_CONTEXT_MAX);
    expect(text).toContain("Cultured Matter");
    expect(text).toContain("creative sustainability agency");
    expect(text).toContain("Mission:");
    expect(text).toContain("Sectors: Beauty, Fashion");
    expect(text).toContain("Fit criteria: Extremely novel and visible");
    // No markup, and nothing private.
    expect(text).not.toMatch(/[<>#*]/);
    expect(text).not.toContain("Founder bio");
  });

  it("stays under the limit and never cuts a word for a very long profile", () => {
    const long = "word ".repeat(2000);
    const text = businessContext({
      name: "Cultured Matter",
      tagline: long,
      mission: long,
      sectors: Array.from({ length: 60 }, (_, i) => `Sector number ${i}`),
      fitCriteria: [long, long, long]
    });
    expect(text.length).toBeLessThanOrEqual(BUSINESS_CONTEXT_MAX);
    expect(text).not.toMatch(/\bwor…|\bwo$/);
  });

  it("reads the stored profile", async () => {
    expect(await loadBusinessContext(db)).toContain("Cultured Matter");
  });
});

describe("seed", () => {
  it("fills only empty fields, never overwrites, and is idempotent", async () => {
    const { db: seedDb, cleanup: done } = await freshDb();
    try {
      // She has already edited her tagline.
      await A.updateBusinessProfile.run({ tagline: "Her own words" }, { db: seedDb });

      const first = await seedBusinessProfile(seedDb);
      expect(first).toContain("mission");
      expect(first).toContain("sectors");
      expect(first).not.toContain("tagline");

      const read = await A.getBusinessProfile.run({}, { db: seedDb });
      expect(read.profile.tagline).toBe("Her own words");
      expect(read.profile.founderName).toBe("Simone Paz");
      expect(read.profile.targetBrands).toEqual(["Osea Malibu", "Rivian", "The RealReal"]);
      // Company details she hasn't given stay empty.
      for (const f of COMPANY_DETAIL_FIELDS) expect(read.profile[f]).toBeNull();

      const logCount = async () =>
        (
          await seedDb
            .select()
            .from(t.activityLog)
            .where(eq(t.activityLog.entityType, "business_profile"))
        ).length;
      const before = await logCount();
      expect(await seedBusinessProfile(seedDb)).toEqual([]);
      expect(await logCount()).toBe(before);
      const again = await A.getBusinessProfile.run({}, { db: seedDb });
      expect(again.profile).toEqual(read.profile);
    } finally {
      done();
    }
  });
});
