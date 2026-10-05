import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as A from "@/actions";
import { loadBusinessContext } from "@/actions/business";
import { toResult } from "@/actions/define";
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

// toResult checks the session; these tests stand in a signed-in one.
vi.mock("@/lib/session", () => ({ getSession: async () => ({ user: { id: "u1" } }) }));

let db: Database;
let cleanup: () => void;
const ctx = () => ({ db });

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
});
afterAll(() => cleanup());

const profileLog = () =>
  db.select().from(t.activityLog).where(eq(t.activityLog.entityType, "business_profile"));

const EIN = "98-7654321";
const UEI = "ABCDEF123456";

describe("business profile actions", () => {
  it("reads an empty profile before anything is saved, with every company detail waiting", async () => {
    const r = await A.getBusinessProfile.run({}, ctx());
    const { ein: _e, samUei: _s, ...rest } = emptyProfile();
    expect(r.profile).toMatchObject(rest);
    expect(r.profile).toMatchObject({ einOnFile: false, samUeiOnFile: false, updatedAt: null });
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

describe("EIN and SAM UEI stay out of the agent's tools", () => {
  it("leaves the values out of the registered reads and writes, and says whether they are on file", async () => {
    const written = await A.updateBusinessProfile.run({ ein: EIN, samUei: UEI }, ctx());
    expect(written.changed).toEqual(["ein", "samUei"]);
    expect(written.profile).not.toHaveProperty("ein");
    expect(written.profile).not.toHaveProperty("samUei");
    expect(JSON.stringify(written)).not.toContain(EIN);

    const read = await A.getBusinessProfile.run({}, ctx());
    expect(read.profile).toMatchObject({ einOnFile: true, samUeiOnFile: true });
    expect(JSON.stringify(read)).not.toContain(EIN);
    expect(JSON.stringify(read)).not.toContain(UEI);
    expect(read.waitingOn).not.toContain("EIN");
  });

  it("gives the values only to the Settings form's read, which is not a tool", async () => {
    const full = await A.getBusinessProfileForEditing.run({}, ctx());
    expect(full.profile.ein).toBe(EIN);
    expect(full.profile.samUei).toBe(UEI);
    const names = A.allActions.map((a) => a.name);
    expect(names).toContain("getBusinessProfile");
    expect(names).not.toContain("getBusinessProfileForEditing");
  });
});

describe("the write log", () => {
  it("names the changed fields and never their values", async () => {
    await A.updateBusinessProfile.run(
      { ein: "11-1111111", samUei: "ZZZZ99998888", address: "1 Main St" },
      ctx()
    );
    const rows = await profileLog();
    const last = rows.at(-1)!;
    expect(last.action).toBe("updateBusinessProfile");
    expect(last.summary).toBe("Updated the business profile: EIN, SAM UEI, business address");
    expect(last.data).toEqual({ fields: ["ein", "samUei", "address"] });
    const all = JSON.stringify(rows);
    for (const secret of [EIN, UEI, "11-1111111", "ZZZZ99998888", "1 Main St"]) {
      expect(all).not.toContain(secret);
    }
  });

  it("logs a save with no changes as such", async () => {
    await A.updateBusinessProfile.run({ ein: "11-1111111" }, ctx());
    const last = (await profileLog()).at(-1)!;
    expect(last.summary).toBe("Saved the business profile (no changes)");
    expect(last.data).toEqual({ fields: [] });
  });
});

describe("a failed save", () => {
  it("never writes the query's parameters (the EIN) to the server log", async () => {
    const { db: broken, cleanup: done } = await freshDb();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // The insert fails, and drizzle's error message carries the values it tried to write.
      await broken.run(sql`DROP TABLE business_profile`);
      const result = await toResult(() =>
        A.updateBusinessProfile.run({ ein: EIN, samUei: UEI }, { db: broken })
      );
      expect(result.ok).toBe(false);
      expect(spy).toHaveBeenCalled();
      const logged = JSON.stringify(spy.mock.calls.map((c) => c.map(String)));
      expect(logged).toContain("DrizzleQueryError");
      expect(logged).toContain("no such table");
      expect(logged).not.toContain(EIN);
      expect(logged).not.toContain(UEI);
      expect(logged).not.toContain("params");
    } finally {
      spy.mockRestore();
      done();
    }
  });
});

describe("the table", () => {
  it("holds only the one row", async () => {
    await expect(
      db.insert(t.businessProfile).values({ id: "second", name: "Another business" })
    ).rejects.toThrow();
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
    // No markup, and no company IDs.
    expect(text).not.toMatch(/[<>#*]/);
    expect(text).not.toContain("EIN");
  });

  it("never carries the EIN or SAM UEI", () => {
    const text = businessContext({ ...emptyProfile(), name: "X", ein: EIN, samUei: UEI });
    expect(text).not.toContain(EIN);
    expect(text).not.toContain(UEI);
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

      const read = await A.getBusinessProfileForEditing.run({}, { db: seedDb });
      expect(read.profile.tagline).toBe("Her own words");
      expect(read.profile.founderName).toBe("Simone Paz");
      expect(read.profile.targetBrands).toEqual(["Osea Malibu", "Rivian", "The RealReal"]);
      // Company details she hasn't given stay empty.
      for (const f of COMPANY_DETAIL_FIELDS) expect(read.profile[f]).toBeNull();
      expect(read.profile.socialLinks).toEqual([]);

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
      const again = await A.getBusinessProfileForEditing.run({}, { db: seedDb });
      expect(again.profile).toEqual(read.profile);
    } finally {
      done();
    }
  });

  it("does not refill a field she cleared on purpose", async () => {
    const { db: seedDb, cleanup: done } = await freshDb();
    try {
      await seedBusinessProfile(seedDb);
      await A.updateBusinessProfile.run({ mission: "", targetBrands: [] }, { db: seedDb });

      expect(await seedBusinessProfile(seedDb)).toEqual([]);
      const read = await A.getBusinessProfileForEditing.run({}, { db: seedDb });
      expect(read.profile.mission).toBeNull();
      expect(read.profile.targetBrands).toEqual([]);
    } finally {
      done();
    }
  });

  it("still fills a field a later seed adds, once", async () => {
    const { db: seedDb, cleanup: done } = await freshDb();
    try {
      await seedBusinessProfile(seedDb, { name: "Cultured Matter" });
      expect(await seedBusinessProfile(seedDb, { name: "X", tagline: "New line" })).toEqual([
        "tagline"
      ]);
      const read = await A.getBusinessProfileForEditing.run({}, { db: seedDb });
      expect(read.profile.name).toBe("Cultured Matter");
      expect(read.profile.tagline).toBe("New line");
    } finally {
      done();
    }
  });
});
