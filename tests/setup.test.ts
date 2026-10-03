import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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
afterEach(() => vi.unstubAllEnvs());

const FLUENT_ENV = {
  FLUENTCRM_URL: "https://crm.example.org/",
  FLUENTCRM_USER: "api-user",
  FLUENTCRM_APP_PASSWORD: "abcd efgh ijkl mnop",
  FLUENTCRM_LIST_ID: "7"
};
function stubFluent(env: Record<string, string>) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
}
const noFluent = () => stubFluent(Object.fromEntries(Object.keys(FLUENT_ENV).map((k) => [k, ""])));

describe("setupStatus", () => {
  it("starts with nothing set up", async () => {
    noFluent();
    expect(await A.setupStatus.run({}, ctx())).toEqual({
      linkedin: { done: false, contacts: 0 },
      outlook: { done: false },
      iphone: { done: false, lastCaptureAt: null },
      newsletter: { done: false },
      done: 0,
      total: 4
    });
  });

  it("counts LinkedIn only from LinkedIn contacts", async () => {
    noFluent();
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
    noFluent();
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

  it("counts Outlook once Microsoft granted mail and contacts", async () => {
    noFluent();
    await db.insert(t.users).values({ id: "u1", name: "Simone", email: "simone@example.com" });
    await db.insert(t.accounts).values({
      id: "acc1",
      accountId: "ms-oid",
      providerId: "microsoft",
      userId: "u1",
      scope: "openid,profile,email,User.Read,offline_access",
      updatedAt: new Date()
    });
    expect((await A.setupStatus.run({}, ctx())).outlook).toEqual({ done: false });

    await db
      .update(t.accounts)
      .set({ scope: "openid,profile,email,User.Read,offline_access,Contacts.Read,Mail.ReadWrite" })
      .where(eq(t.accounts.id, "acc1"));
    const status = await A.setupStatus.run({}, ctx());
    expect(status.outlook).toEqual({ done: true });
    expect(status.done).toBe(3);
  });

  it("counts the newsletter only with real FluentCRM settings", async () => {
    stubFluent({ ...FLUENT_ENV, FLUENTCRM_APP_PASSWORD: "YOUR_APPLICATION_PASSWORD_HERE" });
    expect((await A.setupStatus.run({}, ctx())).newsletter).toEqual({ done: false });

    stubFluent(FLUENT_ENV);
    const status = await A.setupStatus.run({}, ctx());
    expect(status.newsletter).toEqual({ done: true });
    expect(status.done).toBe(4);
    expect(status.total).toBe(4);
  });
});
