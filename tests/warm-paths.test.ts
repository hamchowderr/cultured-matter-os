import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as A from "@/actions";
import { ActionError } from "@/actions";
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

const logFor = (entityId: string) =>
  db.select().from(t.activityLog).where(eq(t.activityLog.entityId, entityId));

async function seedCompany(name: string, domain?: string) {
  const [row] = await db
    .insert(t.companies)
    .values({ name, domain, normalizedName: name.toLowerCase(), firstSeenAt: new Date() })
    .returning();
  return row;
}

async function seedContact(values: Partial<typeof t.contacts.$inferInsert> & { fullName: string }) {
  const [row] = await db
    .insert(t.contacts)
    .values({ source: "sample", ...values })
    .returning();
  return row;
}

const names = async (companyId: string) =>
  (await A.findWarmPath.run({ companyId }, ctx())).paths.map((p) => p.contact.fullName).sort();

describe("warm paths", () => {
  it("matches a contact by company domain", async () => {
    const co = await seedCompany("Mycofab", "mycofab.com");
    await seedContact({
      fullName: "Ana Domain",
      company: "Other name",
      companyDomain: "mycofab.com"
    });
    const { paths } = await A.findWarmPath.run({ companyId: co.id }, ctx());
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatchObject({ via: "company", reason: "works_at", target: "Mycofab" });
  });

  it("matches a contact by company name, ignoring case and suffixes", async () => {
    const co = await seedCompany("Kelp Labs");
    await seedContact({ fullName: "Bo Name", company: "KELP LABS, Inc." });
    await seedContact({ fullName: "Not Me", company: "Kelp Labs Foundation" });
    expect(await names(co.id)).toEqual(["Bo Name"]);
  });

  it("matches a contact at a paired brand by domain or name", async () => {
    const co = await seedCompany("Silkworks");
    const pairing = await A.addPairing.run(
      { companyId: co.id, brandName: "Aesop", brandDomain: "https://www.aesop.com/us" },
      ctx()
    );
    expect(pairing.brandDomain).toBe("aesop.com");
    await seedContact({ fullName: "Cy Brand Domain", companyDomain: "aesop.com" });
    await seedContact({ fullName: "Dee Brand Name", company: "Aesop" });
    const { paths } = await A.findWarmPath.run({ companyId: co.id }, ctx());
    expect(paths.map((p) => `${p.contact.fullName}|${p.via}|${p.target}`).sort()).toEqual([
      "Cy Brand Domain|brand|Aesop",
      "Dee Brand Name|brand|Aesop"
    ]);
  });

  it("includes hand-made links with their note, to the company or a brand", async () => {
    const co = await seedCompany("Ferment Co");
    const brand = await A.addPairing.run({ companyId: co.id, brandName: "Patagonia" }, ctx());
    const friend = await seedContact({ fullName: "Ed Friend", company: "Somewhere" });
    const other = await seedContact({ fullName: "Flo Other", company: "Elsewhere" });

    const toCompany = await A.linkContact.run(
      { contactId: friend.id, companyId: co.id, note: "Met at IndieBio" },
      ctx()
    );
    await A.linkContact.run({ contactId: other.id, pairingId: brand.id }, ctx());

    const { paths } = await A.findWarmPath.run({ companyId: co.id }, ctx());
    expect(paths.find((p) => p.contact.id === friend.id)).toMatchObject({
      reason: "linked",
      via: "company",
      note: "Met at IndieBio",
      linkId: toCompany.linkId
    });
    expect(paths.find((p) => p.contact.id === other.id)).toMatchObject({
      reason: "linked",
      via: "brand",
      target: "Patagonia"
    });

    await expect(
      A.linkContact.run({ contactId: friend.id, companyId: co.id }, ctx())
    ).rejects.toBeInstanceOf(ActionError);
  });

  it("counts distinct contacts for many companies at once, matching findWarmPath", async () => {
    const a = await seedCompany("Countable", "countable.io");
    const b = await seedCompany("Lonely Startup");
    const brand = await A.addPairing.run(
      { companyId: a.id, brandName: "Allbirds", brandDomain: "allbirds.com" },
      ctx()
    );
    const both = await seedContact({ fullName: "Gus Both", companyDomain: "countable.io" });
    await seedContact({ fullName: "Hal Brand", company: "Allbirds" });
    // Linked to the brand as well as working at the company: still one person.
    await A.linkContact.run({ contactId: both.id, pairingId: brand.id }, ctx());

    const { counts } = await A.countWarmPaths.run({ companyIds: [a.id, b.id] }, ctx());
    expect(counts).toEqual({ [a.id]: 2, [b.id]: 0 });
    expect(new Set(await names(a.id))).toEqual(new Set(["Gus Both", "Hal Brand"]));
  });
});

describe("a contact's warm paths", () => {
  const forContact = async (contactId: string) =>
    (await A.contactWarmPaths.run({ contactId }, ctx())).paths;

  it("finds the company a contact works at by domain", async () => {
    const co = await seedCompany("Osea Labs", "osealabs.com");
    const c = await seedContact({
      fullName: "Kim Domain",
      company: "Different name",
      companyDomain: "osealabs.com"
    });
    expect(await forContact(c.id)).toEqual([
      {
        companyId: co.id,
        companyName: "Osea Labs",
        via: "company",
        target: "Osea Labs",
        reason: "works_at",
        note: null,
        linkId: null
      }
    ]);
  });

  it("finds the company by name, ignoring case and suffixes, but not a longer name", async () => {
    const co = await seedCompany("Mossy Works");
    await seedCompany("Mossy");
    const c = await seedContact({ fullName: "Lu Name", company: "MOSSY WORKS, LLC" });
    const paths = await forContact(c.id);
    expect(paths.map((p) => p.companyId)).toEqual([co.id]);
  });

  it("finds a paired brand by domain or name, naming the radar company behind it", async () => {
    const co = await seedCompany("Algae Arc");
    await A.addPairing.run(
      { companyId: co.id, brandName: "Lush Cosmetics", brandDomain: "lush.com" },
      ctx()
    );
    const byDomain = await seedContact({ fullName: "Mo Brand Domain", companyDomain: "lush.com" });
    const byName = await seedContact({ fullName: "Nia Brand Name", company: "lush cosmetics" });
    for (const c of [byDomain, byName]) {
      expect(await forContact(c.id)).toEqual([
        expect.objectContaining({
          companyId: co.id,
          companyName: "Algae Arc",
          via: "brand",
          target: "Lush Cosmetics",
          reason: "works_at"
        })
      ]);
    }
  });

  it("includes hand links to a company or a brand, with the note", async () => {
    const co = await seedCompany("Spore Supply");
    const other = await seedCompany("Biofab Inc");
    const brand = await A.addPairing.run({ companyId: other.id, brandName: "Rothy's" }, ctx());
    const c = await seedContact({ fullName: "Oz Linked", company: "Unrelated" });
    const link = await A.linkContact.run(
      { contactId: c.id, companyId: co.id, note: "Old roommate" },
      ctx()
    );
    await A.linkContact.run({ contactId: c.id, pairingId: brand.id }, ctx());

    const paths = await forContact(c.id);
    expect(paths).toEqual([
      expect.objectContaining({
        companyId: other.id,
        companyName: "Biofab Inc",
        via: "brand",
        target: "Rothy's",
        reason: "linked"
      }),
      expect.objectContaining({
        companyId: co.id,
        companyName: "Spore Supply",
        via: "company",
        target: "Spore Supply",
        reason: "linked",
        note: "Old roommate",
        linkId: link.linkId
      })
    ]);
  });

  it("agrees with findWarmPath from the company side", async () => {
    const co = await seedCompany("Agree Bio", "agreebio.com");
    const brand = await A.addPairing.run({ companyId: co.id, brandName: "Agree Brand" }, ctx());
    const c = await seedContact({ fullName: "Pat Agree", companyDomain: "agreebio.com" });
    await A.linkContact.run({ contactId: c.id, pairingId: brand.id }, ctx());

    const fromCompany = (await A.findWarmPath.run({ companyId: co.id }, ctx())).paths
      .filter((p) => p.contact.id === c.id)
      .map((p) => `${p.via}|${p.target}|${p.reason}`)
      .sort();
    const fromContact = (await forContact(c.id)).map((p) => `${p.via}|${p.target}|${p.reason}`);
    expect(fromContact.sort()).toEqual(fromCompany);
    expect(fromContact).toHaveLength(2);
  });

  it("is empty for a contact with no company and no links, and refuses an unknown contact", async () => {
    const c = await seedContact({ fullName: "Quinn Nobody" });
    expect(await forContact(c.id)).toEqual([]);
    await expect(
      A.contactWarmPaths.run({ contactId: "no-such-contact" }, ctx())
    ).rejects.toBeInstanceOf(ActionError);
  });
});

describe("pairings and links", () => {
  it("adds and removes a target brand, logging both", async () => {
    const co = await seedCompany("Logged Bio");
    const p = await A.addPairing.run(
      {
        companyId: co.id,
        brandName: "Glossier",
        brandDomain: "glossier.com",
        note: "Clean beauty"
      },
      ctx()
    );
    expect((await A.listPairings.run({ companyId: co.id }, ctx())).pairings).toHaveLength(1);

    await expect(
      A.addPairing.run({ companyId: co.id, brandName: "glossier" }, ctx())
    ).rejects.toBeInstanceOf(ActionError);
    await expect(
      A.addPairing.run({ companyId: co.id, brandName: "Odd", brandDomain: "not a site" }, ctx())
    ).rejects.toBeInstanceOf(ActionError);

    await A.removePairing.run({ pairingId: p.id }, ctx());
    expect((await A.listPairings.run({ companyId: co.id }, ctx())).pairings).toHaveLength(0);

    const log = await logFor(co.id);
    expect(log.map((l) => [l.action, l.summary])).toEqual([
      ["addPairing", "Paired Glossier with Logged Bio"],
      ["removePairing", "Removed Glossier from Logged Bio"]
    ]);
  });

  it("links and unlinks a contact, logging both", async () => {
    const co = await seedCompany("Linkable");
    const c = await seedContact({ fullName: "Ivy Link", company: "Nowhere" });
    const link = await A.linkContact.run(
      { contactId: c.id, companyId: co.id, note: "College friend" },
      ctx()
    );
    expect(await names(co.id)).toEqual(["Ivy Link"]);

    await A.unlinkContact.run({ linkId: link.linkId }, ctx());
    expect(await names(co.id)).toEqual([]);

    const log = await logFor(co.id);
    expect(log.map((l) => [l.action, l.summary])).toEqual([
      ["linkContact", "Linked Ivy Link to Linkable"],
      ["unlinkContact", "Unlinked Ivy Link from Linkable"]
    ]);
  });

  it("refuses a link with no target or two targets", async () => {
    const co = await seedCompany("Strict");
    const c = await seedContact({ fullName: "Jo Strict" });
    await expect(A.linkContact.run({ contactId: c.id }, ctx())).rejects.toThrow();
    const brand = await A.addPairing.run({ companyId: co.id, brandName: "Both" }, ctx());
    await expect(
      A.linkContact.run({ contactId: c.id, companyId: co.id, pairingId: brand.id }, ctx())
    ).rejects.toThrow();
  });
});
