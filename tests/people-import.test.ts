import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as A from "@/actions";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import { normalizeProfileUrl, parseConnectionsCsv } from "@/lib/linkedin";
import { freshDb } from "./test-db";

const sample = readFileSync("tests/fixtures/connections-sample.csv", "utf8");

let db: Database;
let cleanup: () => void;
const ctx = () => ({ db });
beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
});
afterAll(() => cleanup());

describe("LinkedIn Connections.csv parser", () => {
  it("skips the Notes preamble and blank rows, keeps rows without email", () => {
    const { rows, skipped } = parseConnectionsCsv(sample);
    expect(rows).toHaveLength(8);
    expect(skipped).toBe(1);
    const priya = rows.find((r) => r.fullName === "Priya Nair")!;
    expect(priya).toMatchObject({
      email: null,
      profileUrl: "https://www.linkedin.com/in/priya-nair-sample",
      connectedOn: "2025-01-02"
    });
    expect(rows.find((r) => r.fullName === "Sam Okafor")).toMatchObject({
      company: "Algae Works, Inc.",
      companyDomain: null
    });
    expect(rows.find((r) => r.fullName === "Ada Kim")!.companyDomain).toBe("mycoform.io");
  });

  it("rejects a file that is not a Connections export", () => {
    expect(() => parseConnectionsCsv("name,email\nx,y")).toThrow(/Connections.csv/);
  });

  it("normalizes profile URLs", () => {
    expect(normalizeProfileUrl("https://linkedin.com/in/Jane-Doe/?trk=abc")).toBe(
      "https://www.linkedin.com/in/jane-doe"
    );
  });
});

describe("importContacts", () => {
  it("creates contacts, then updates them on re-import without losing tags", async () => {
    const first = await A.importContacts.run({ csv: sample }, ctx());
    expect(first).toEqual({ created: 8, updated: 0, skipped: 1 });

    const [jordan] = await db
      .select()
      .from(t.contacts)
      .where(eq(t.contacts.fullName, "Jordan Rivera"));
    await A.setContactSectors.run(
      { contactId: jordan.id, sectors: ["Beauty/Chemistry", "Retail"] },
      ctx()
    );

    const changed = sample.replace("Head of Sustainability", "VP Sustainability");
    const second = await A.importContacts.run({ csv: changed }, ctx());
    expect(second).toEqual({ created: 0, updated: 8, skipped: 1 });

    const all = await db.select().from(t.contacts);
    expect(all).toHaveLength(8);
    const [after] = await db.select().from(t.contacts).where(eq(t.contacts.id, jordan.id));
    expect(after.position).toBe("VP Sustainability");
    expect(after.sectors).toEqual(["Beauty/Chemistry", "Retail"]);
    expect(after.source).toBe("linkedin_csv");
  });

  it("finds contacts by name, company and sector tag", async () => {
    const byCompany = await A.searchContacts.run({ query: "Glossier" }, ctx());
    expect(byCompany.contacts.map((c) => c.fullName)).toEqual(["Lena Fischer"]);
    const bySector = await A.searchContacts.run({ sector: "Retail" }, ctx());
    expect(bySector.contacts.map((c) => c.fullName)).toEqual(["Jordan Rivera"]);
    expect(bySector.total).toBe(1);
  });

  it("logs the import and rejects a bad file", async () => {
    const logs = await db
      .select()
      .from(t.activityLog)
      .where(eq(t.activityLog.action, "importContacts"));
    expect(logs[0].summary).toBe("Imported LinkedIn connections: 8 new, 0 updated, 1 skipped");
    await expect(A.importContacts.run({ csv: "not,a,linkedin,file" }, ctx())).rejects.toThrow(
      /Connections.csv/
    );
  });
});
