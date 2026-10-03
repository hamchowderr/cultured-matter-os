import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Better Auth hands out the stored Microsoft token; no real Microsoft calls in tests.
vi.mock("@/lib/auth", () => ({
  auth: { api: { getAccessToken: vi.fn(async () => ({ accessToken: "test-token" })) } }
}));

import * as A from "@/actions";
import { threadHasReply } from "@/actions/outlook";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import { freshDb } from "./test-db";

let db: Database;
let cleanup: () => void;
const ctx = () => ({ db });

const ME = "simone@culturedmatter.com";
const FULL_SCOPE = "openid,profile,email,User.Read,offline_access,Contacts.Read,Mail.ReadWrite";

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let routes: Record<string, (call: Call) => Response>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function route(url: string) {
  const path = new URL(url).pathname.replace("/v1.0", "");
  return Object.entries(routes).find(([p]) => path === p)?.[1];
}

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
  await db.insert(t.users).values({ id: "u1", name: "Simone", email: ME });
  await db.insert(t.accounts).values({
    id: "acc1",
    accountId: "ms-oid",
    providerId: "microsoft",
    userId: "u1",
    scope: "openid,profile,email,User.Read,offline_access",
    updatedAt: new Date()
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = {
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined
      };
      calls.push(call);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-token");
      const handler = route(url);
      return handler ? handler(call) : json({ error: { code: "NotFound" } }, 404);
    })
  );
});
afterAll(() => {
  vi.unstubAllGlobals();
  cleanup();
});
beforeEach(() => {
  calls = [];
  routes = { "/me": () => json({ mail: ME, userPrincipalName: ME }) };
});

const grantScopes = () =>
  db.update(t.accounts).set({ scope: FULL_SCOPE }).where(eq(t.accounts.id, "acc1"));

describe("Outlook connection", () => {
  it("asks to connect when Microsoft hasn't granted the mail and contacts scopes", async () => {
    expect(await A.outlookStatus.run({}, ctx())).toEqual({
      connected: false,
      missingScopes: ["Contacts.Read", "Mail.ReadWrite"]
    });
    await expect(A.syncOutlook.run({}, ctx())).rejects.toMatchObject({
      code: "outlook_not_connected"
    });
    expect(calls).toHaveLength(0);

    await grantScopes();
    expect(await A.outlookStatus.run({}, ctx())).toEqual({ connected: true, missingScopes: [] });
  });
});

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const from = (address: string, name?: string) => ({ emailAddress: { address, name } });

describe("syncOutlook", () => {
  beforeEach(() => {
    routes["/me/contacts"] = () =>
      json({
        value: [
          {
            displayName: "Jordan Rivera",
            givenName: "Jordan",
            surname: "Rivera",
            emailAddresses: [{ address: "Jordan@AlgaeWorks.com" }],
            companyName: "Algae Works",
            jobTitle: "Head of Sustainability"
          },
          {
            displayName: "Priya Nair",
            givenName: "Priya",
            surname: "Nair",
            emailAddresses: [{ address: "priya@mycoform.io" }],
            companyName: "Mycoform"
          }
        ],
        // A second page proves nextLink is followed.
        "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/contacts?$skip=2"
      });
    routes["/me/mailFolders/inbox/messages"] = () =>
      json({
        value: [
          {
            id: "m-in-1",
            conversationId: "c1",
            subject: "Intro to Soliome",
            from: from("lena@soliome.com", "Lena Fischer"),
            receivedDateTime: day(2),
            webLink: "https://outlook.office365.com/owa/?ItemID=m-in-1",
            isDraft: false
          },
          {
            id: "m-in-2",
            conversationId: "c2",
            subject: "Your receipt",
            from: from("no-reply@shop.com", "Shop"),
            receivedDateTime: day(3),
            isDraft: false
          },
          {
            id: "m-in-3",
            conversationId: "c3",
            subject: "Re: pilot",
            from: from("jordan@algaeworks.com", "Jordan Rivera"),
            receivedDateTime: day(1),
            webLink: "https://outlook.office365.com/owa/?ItemID=m-in-3",
            isDraft: false
          }
        ]
      });
    routes["/me/mailFolders/sentitems/messages"] = () =>
      json({
        value: [
          {
            id: "m-out-1",
            conversationId: "c3",
            subject: "pilot",
            from: from(ME),
            toRecipients: [from("priya@mycoform.io")],
            ccRecipients: [from("jordan@algaeworks.com"), from(ME)],
            sentDateTime: day(4),
            webLink: "https://outlook.office365.com/owa/?ItemID=m-out-1",
            isDraft: false
          }
        ]
      });
  });

  it("imports contacts and senders without duplicates and logs their emails", async () => {
    // Already in People from LinkedIn, with no company yet.
    await db.insert(t.contacts).values({
      fullName: "Jordan Rivera",
      email: "jordan@algaeworks.com",
      profileUrl: "https://www.linkedin.com/in/jordan-rivera",
      source: "linkedin_csv"
    });
    routes["/me/contacts"] = ((first) => (call: Call) =>
      call.url.includes("$skip=2") ? json({ value: [] }) : first(call))(routes["/me/contacts"]);

    const first = await A.syncOutlook.run({}, ctx());
    expect(first).toEqual({ created: 2, matched: 1, emailsLogged: 4 });
    expect(calls.some((c) => c.url.includes("$skip=2"))).toBe(true);
    // OData query keeps a literal $ and an encoded filter.
    const inbox = calls.find((c) => c.url.includes("/mailFolders/inbox/"))!.url;
    expect(inbox).toContain("$filter=receivedDateTime%20ge%20");
    expect(inbox).toContain("$orderby=receivedDateTime%20desc");

    const people = await db.select().from(t.contacts);
    expect(people.map((p) => p.email).sort()).toEqual([
      "jordan@algaeworks.com",
      "lena@soliome.com",
      "priya@mycoform.io"
    ]);
    const jordan = people.find((p) => p.email === "jordan@algaeworks.com")!;
    expect(jordan).toMatchObject({ source: "linkedin_csv", company: "Algae Works" });
    expect(people.find((p) => p.email === "lena@soliome.com")).toMatchObject({
      fullName: "Lena Fischer",
      firstName: "Lena",
      lastName: "Fischer",
      companyDomain: "soliome.com",
      source: "outlook"
    });

    // Running again adds nothing.
    const again = await A.syncOutlook.run({}, ctx());
    expect(again).toEqual({ created: 0, matched: 3, emailsLogged: 0 });
    expect(await db.select().from(t.contacts)).toHaveLength(3);
    expect(await db.select().from(t.contactEmails)).toHaveLength(4);
  });

  it("shows a contact's recent emails, newest first, with Outlook links", async () => {
    const [jordan] = await db
      .select()
      .from(t.contacts)
      .where(eq(t.contacts.email, "jordan@algaeworks.com"));
    const { emails } = await A.listContactEmails.run({ contactId: jordan.id }, ctx());
    expect(emails.map((e) => [e.subject, e.direction, e.webLink])).toEqual([
      ["Re: pilot", "in", "https://outlook.office365.com/owa/?ItemID=m-in-3"],
      ["pilot", "out", "https://outlook.office365.com/owa/?ItemID=m-out-1"]
    ]);
    const log = await db
      .select()
      .from(t.activityLog)
      .where(eq(t.activityLog.action, "syncOutlook"));
    expect(log[0].summary).toBe("Synced Outlook: 2 new people, 4 emails logged");
  });
});

describe("Draft follow-up", () => {
  let contactId: string;
  let taskId: string;

  beforeAll(async () => {
    const [lena] = await db
      .select()
      .from(t.contacts)
      .where(eq(t.contacts.email, "lena@soliome.com"));
    contactId = lena.id;
    taskId = (await A.createTask.run({ title: "Ask Lena about Soliome" }, ctx())).id;
  });

  const draft = () =>
    A.draftFollowUp.run(
      { contactId, taskId, subject: "Following up", body: "Hi Lena,\n\nAny news?" },
      ctx()
    );

  it("queues an approval and makes no Outlook call until it is approved", async () => {
    const approval = await draft();
    expect(approval).toMatchObject({ action: "outlook_draft", status: "pending" });
    expect(approval.summary).toContain("Lena Fischer");
    expect(calls).toHaveLength(0);

    await A.decideApproval.run({ approvalId: approval.id, decision: "reject" }, ctx());
    expect(calls).toHaveLength(0);
  });

  it("saves the draft in Outlook when approved and sets the task waiting", async () => {
    routes["/me/messages"] = () =>
      json(
        {
          id: "draft-1",
          conversationId: "conv-lena",
          webLink: "https://outlook.office365.com/owa/?ItemID=draft-1",
          isDraft: true
        },
        201
      );
    const approval = await draft();
    const decided = await A.decideApproval.run(
      { approvalId: approval.id, decision: "approve" },
      ctx()
    );

    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("https://graph.microsoft.com/v1.0/me/messages");
    expect(post.body).toEqual({
      subject: "Following up",
      body: { contentType: "Text", content: "Hi Lena,\n\nAny news?" },
      toRecipients: [{ emailAddress: { address: "lena@soliome.com", name: "Lena Fischer" } }]
    });
    expect(decided).toMatchObject({
      status: "approved",
      result: {
        draftId: "draft-1",
        webLink: "https://outlook.office365.com/owa/?ItemID=draft-1",
        conversationId: "conv-lena",
        taskId
      }
    });
    const [task] = await db.select().from(t.tasks).where(eq(t.tasks.id, taskId));
    expect(task).toMatchObject({ status: "waiting", outlookConversationId: "conv-lena" });
  });

  it("keeps the approval pending when Outlook fails", async () => {
    routes["/me/messages"] = () => json({ error: { code: "ServiceUnavailable" } }, 503);
    const approval = await draft();
    await expect(
      A.decideApproval.run({ approvalId: approval.id, decision: "approve" }, ctx())
    ).rejects.toMatchObject({ code: "unavailable" });
    const [row] = await db.select().from(t.approvals).where(eq(t.approvals.id, approval.id));
    expect(row.status).toBe("pending");
  });

  it("refuses a contact with no email", async () => {
    const [noEmail] = await db
      .insert(t.contacts)
      .values({ fullName: "Sam Okafor", source: "manual" })
      .returning();
    await expect(
      A.draftFollowUp.run({ contactId: noEmail.id, subject: "Hi", body: "Hello" }, ctx())
    ).rejects.toThrow(/no email/);
  });
});

describe("Reply check", () => {
  const me = new Set([ME]);
  const sent = (at: string) => ({ id: "s", from: from(ME), sentDateTime: at, isDraft: false });
  const got = (at: string) => ({
    id: "r",
    from: from("lena@soliome.com"),
    receivedDateTime: at,
    isDraft: false
  });

  it("counts only a reply newer than her last sent message", () => {
    expect(threadHasReply([sent(day(3)), got(day(1))], me)).toBe(true);
    expect(threadHasReply([got(day(5)), sent(day(3))], me)).toBe(false);
    // Draft not sent yet: nothing to reply to.
    expect(threadHasReply([{ ...sent(day(3)), isDraft: true }, got(day(1))], me)).toBe(false);
  });

  it("moves a waiting task to replied when a reply arrives", async () => {
    const quiet = await A.createTask.run({ title: "Chase Priya", status: "waiting" }, ctx());
    await db
      .update(t.tasks)
      .set({ outlookConversationId: "conv-priya" })
      .where(eq(t.tasks.id, quiet.id));

    routes["/me/messages"] = (call) => {
      const filter = decodeURIComponent(new URL(call.url).search);
      if (filter.includes("'conv-lena'")) return json({ value: [sent(day(2)), got(day(1))] });
      if (filter.includes("'conv-priya'")) return json({ value: [sent(day(2))] });
      return json({ value: [] });
    };

    const result = await A.checkOutlookReplies.run({}, ctx());
    expect(result.checked).toBe(2);
    expect(result.replied.map((r) => r.title)).toEqual(["Ask Lena about Soliome"]);

    const rows = await db.select().from(t.tasks);
    expect(rows.find((r) => r.title === "Ask Lena about Soliome")!.status).toBe("replied");
    expect(rows.find((r) => r.title === "Chase Priya")!.status).toBe("waiting");
    const log = await db
      .select()
      .from(t.activityLog)
      .where(eq(t.activityLog.action, "checkOutlookReplies"));
    expect(log[0].summary).toBe('Replies arrived: "Ask Lena about Soliome"');
  });

  it("skips Microsoft entirely when nothing is waiting", async () => {
    await db.update(t.tasks).set({ status: "done" });
    const result = await A.checkOutlookReplies.run({}, ctx());
    expect(result).toEqual({ checked: 0, replied: [] });
    expect(calls).toHaveLength(0);
  });
});
