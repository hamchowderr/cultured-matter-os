import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Better Auth hands out the stored Google token; no real Google calls in tests.
const getAccessToken = vi.hoisted(() => vi.fn(async () => ({ accessToken: "test-token" })));
vi.mock("@/lib/auth", () => ({ auth: { api: { getAccessToken } } }));

import * as A from "@/actions";
import { threadHasReply, type GmailMessage } from "@/actions/outlook";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import { GOOGLE_SCOPES } from "@/lib/google-scopes";
import { parseAddressList, rawMessage } from "@/lib/google";
import { freshDb } from "./test-db";

let db: Database;
let cleanup: () => void;
const ctx = () => ({ db });

const ME = "simone@simonepaz.com";
const GMAIL = "gmail.googleapis.com/gmail/v1/users/me";
const PEOPLE = "people.googleapis.com/v1";
// Google returns granted scopes space separated.
const FULL_SCOPE = ["openid", "email", "profile", ...GOOGLE_SCOPES].join(" ");

type Call = { url: URL; method: string; body: any };
let calls: Call[] = [];
let routes: Record<string, (call: Call) => Response>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
  await db.insert(t.users).values({ id: "u1", name: "Simone", email: ME });
  await db.insert(t.accounts).values({
    id: "acc1",
    accountId: "google-sub",
    providerId: "google",
    userId: "u1",
    scope: "openid email profile",
    updatedAt: new Date()
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      const call = {
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined
      };
      calls.push(call);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-token");
      const handler = routes[url.host + url.pathname];
      return handler ? handler(call) : json({ error: { code: 404 } }, 404);
    })
  );
});
afterAll(() => {
  vi.unstubAllGlobals();
  cleanup();
});
beforeEach(() => {
  calls = [];
  routes = { [`${GMAIL}/profile`]: () => json({ emailAddress: ME }) };
});

const grantScopes = () =>
  db.update(t.accounts).set({ scope: FULL_SCOPE }).where(eq(t.accounts.id, "acc1"));

const day = (n: number) => String(Date.now() - n * 86_400_000);
const msg = (
  id: string,
  opts: {
    thread?: string;
    labels: string[];
    from: string;
    to?: string;
    cc?: string;
    subject?: string;
    at: string;
  }
): GmailMessage => ({
  id,
  threadId: opts.thread ?? `t-${id}`,
  labelIds: opts.labels,
  internalDate: opts.at,
  payload: {
    headers: [
      { name: "From", value: opts.from },
      ...(opts.to ? [{ name: "To", value: opts.to }] : []),
      ...(opts.cc ? [{ name: "Cc", value: opts.cc }] : []),
      ...(opts.subject ? [{ name: "Subject", value: opts.subject }] : [])
    ]
  }
});

describe("Google connection", () => {
  it("asks to connect when Google hasn't granted Gmail and Contacts", async () => {
    expect(await A.outlookStatus.run({}, ctx())).toEqual({
      connected: false,
      missingScopes: [...GOOGLE_SCOPES]
    });
    await expect(A.syncOutlook.run({}, ctx())).rejects.toMatchObject({
      code: "google_not_connected"
    });
    expect(calls).toHaveLength(0);

    await grantScopes();
    expect(await A.outlookStatus.run({}, ctx())).toEqual({ connected: true, missingScopes: [] });
  });

  it("asks to connect again when the refresh token no longer works", async () => {
    getAccessToken.mockRejectedValueOnce(new Error("invalid_grant"));
    await expect(A.syncOutlook.run({}, ctx())).rejects.toMatchObject({
      code: "google_not_connected"
    });
    expect(calls).toHaveLength(0);
  });

  it("asks to connect again when Google refuses the token", async () => {
    routes[`${GMAIL}/profile`] = () => json({ error: { code: 401 } }, 401);
    await expect(A.syncOutlook.run({}, ctx())).rejects.toMatchObject({
      code: "google_not_connected"
    });
  });
});

describe("syncOutlook (Gmail and Google Contacts)", () => {
  const messages: Record<string, GmailMessage> = {
    "m-in-1": msg("m-in-1", {
      thread: "c1",
      labels: ["INBOX", "UNREAD"],
      from: '"Lena Fischer" <lena@soliome.com>',
      to: ME,
      subject: "Intro to Soliome",
      at: day(2)
    }),
    "m-in-2": msg("m-in-2", {
      labels: ["INBOX"],
      from: "Shop <no-reply@shop.com>",
      subject: "Your receipt",
      at: day(3)
    }),
    "m-in-3": msg("m-in-3", {
      thread: "c3",
      labels: ["INBOX"],
      from: "Jordan Rivera <jordan@algaeworks.com>",
      subject: "Re: pilot",
      at: day(1)
    }),
    "m-out-1": msg("m-out-1", {
      thread: "c3",
      labels: ["SENT"],
      from: `Simone Paz <${ME}>`,
      to: "priya@mycoform.io",
      cc: `"Rivera, Jordan" <jordan@algaeworks.com>, ${ME}`,
      subject: "pilot",
      at: day(4)
    }),
    "m-out-2": msg("m-out-2", {
      labels: ["SENT"],
      from: ME,
      to: "sam@kelp.co",
      subject: "Kelp",
      at: day(5)
    })
  };

  beforeEach(() => {
    routes[`${PEOPLE}/people/me/connections`] = () =>
      json({
        connections: [
          {
            names: [{ displayName: "Jordan Rivera", givenName: "Jordan", familyName: "Rivera" }],
            emailAddresses: [{ value: "Jordan@AlgaeWorks.com" }],
            organizations: [{ name: "Algae Works", title: "Head of Sustainability" }]
          },
          {
            names: [{ displayName: "Priya Nair", givenName: "Priya", familyName: "Nair" }],
            emailAddresses: [{ value: "priya@mycoform.io" }],
            organizations: [{ name: "Mycoform" }]
          },
          // No email: nothing to match on.
          { names: [{ displayName: "Phone Only" }] }
        ]
      });
    routes[`${PEOPLE}/otherContacts`] = () =>
      json({
        otherContacts: [
          { names: [{ displayName: "Sam Lee" }], emailAddresses: [{ value: "sam@kelp.co" }] },
          // Saved by Gmail long ago; not in recent mail, so not imported.
          { names: [{ displayName: "Old Thread" }], emailAddresses: [{ value: "old@x.com" }] }
        ]
      });
    // Two pages prove nextPageToken is followed.
    routes[`${GMAIL}/messages`] = (call) =>
      call.url.searchParams.get("pageToken") === "p2"
        ? json({ messages: [{ id: "m-out-1" }, { id: "m-out-2" }] })
        : json({
            messages: [{ id: "m-in-1" }, { id: "m-in-2" }, { id: "m-in-3" }],
            nextPageToken: "p2"
          });
    for (const [id, m] of Object.entries(messages))
      routes[`${GMAIL}/messages/${id}`] = () => json(m);
  });

  it("imports contacts and correspondents without duplicates and logs their emails", async () => {
    // Already in People from LinkedIn, with no company yet.
    await db.insert(t.contacts).values({
      fullName: "Jordan Rivera",
      email: "jordan@algaeworks.com",
      profileUrl: "https://www.linkedin.com/in/jordan-rivera",
      source: "linkedin_csv"
    });

    const first = await A.syncOutlook.run({}, ctx());
    expect(first).toEqual({ created: 3, matched: 1, emailsLogged: 5 });

    const list = calls.filter((c) => c.url.pathname.endsWith("/users/me/messages"));
    expect(list.map((c) => c.url.searchParams.get("pageToken"))).toEqual([null, "p2"]);
    expect(list[0].url.searchParams.get("q")).toBe("newer_than:60d -in:drafts -in:chats");
    const get = calls.find((c) => c.url.pathname.endsWith("/messages/m-in-1"))!;
    expect(get.url.searchParams.get("format")).toBe("metadata");
    expect(get.url.searchParams.getAll("metadataHeaders")).toEqual(["From", "To", "Cc", "Subject"]);
    const connections = calls.find((c) => c.url.pathname.endsWith("/connections"))!;
    expect(connections.url.searchParams.get("personFields")).toBe(
      "names,emailAddresses,organizations"
    );
    const other = calls.find((c) => c.url.pathname.endsWith("/otherContacts"))!;
    expect(other.url.searchParams.get("readMask")).toBe("names,emailAddresses");

    const people = await db.select().from(t.contacts);
    expect(people.map((p) => p.email).sort()).toEqual([
      "jordan@algaeworks.com",
      "lena@soliome.com",
      "priya@mycoform.io",
      "sam@kelp.co"
    ]);
    expect(people.find((p) => p.email === "jordan@algaeworks.com")).toMatchObject({
      source: "linkedin_csv",
      company: "Algae Works",
      position: "Head of Sustainability"
    });
    expect(people.find((p) => p.email === "lena@soliome.com")).toMatchObject({
      fullName: "Lena Fischer",
      firstName: "Lena",
      lastName: "Fischer",
      companyDomain: "soliome.com",
      source: "google"
    });
    // A person she wrote to, named from Gmail's "Other contacts".
    expect(people.find((p) => p.email === "sam@kelp.co")).toMatchObject({
      fullName: "Sam Lee",
      source: "google"
    });

    // Running again adds nothing.
    const again = await A.syncOutlook.run({}, ctx());
    expect(again).toEqual({ created: 0, matched: 4, emailsLogged: 0 });
    expect(await db.select().from(t.contacts)).toHaveLength(4);
    expect(await db.select().from(t.contactEmails)).toHaveLength(5);
  });

  it("shows a contact's recent emails, newest first, with Gmail links", async () => {
    const [jordan] = await db
      .select()
      .from(t.contacts)
      .where(eq(t.contacts.email, "jordan@algaeworks.com"));
    const { emails } = await A.listContactEmails.run({ contactId: jordan.id }, ctx());
    expect(emails.map((e) => [e.subject, e.direction, e.conversationId, e.webLink])).toEqual([
      [
        "Re: pilot",
        "in",
        "c3",
        "https://mail.google.com/mail/u/simone%40simonepaz.com/#all/m-in-3"
      ],
      ["pilot", "out", "c3", "https://mail.google.com/mail/u/simone%40simonepaz.com/#all/m-out-1"]
    ]);
    const log = await db
      .select()
      .from(t.activityLog)
      .where(eq(t.activityLog.action, "syncOutlook"));
    expect(log[0].summary).toBe("Synced Gmail: 3 new people, 5 emails logged");
  });
});

const decodeRaw = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");
const decodeBody = (message: string) =>
  Buffer.from(message.split("\r\n\r\n")[1].replace(/\r\n/g, ""), "base64").toString("utf8");

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

  it("queues an approval and makes no Gmail call until it is approved", async () => {
    const approval = await draft();
    expect(approval).toMatchObject({ action: "gmail_draft", status: "pending" });
    expect(approval.summary).toContain("Gmail draft to Lena Fischer");
    expect(calls).toHaveLength(0);

    await A.decideApproval.run({ approvalId: approval.id, decision: "reject" }, ctx());
    expect(calls).toHaveLength(0);
  });

  it("saves the draft in Gmail when approved and sets the task waiting", async () => {
    routes[`${GMAIL}/drafts`] = () =>
      json({
        id: "r-draft-1",
        message: { id: "msg-draft-1", threadId: "thread-lena", labelIds: ["DRAFT"] }
      });
    const approval = await draft();
    const decided = await A.decideApproval.run(
      { approvalId: approval.id, decision: "approve" },
      ctx()
    );

    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url.href).toBe("https://gmail.googleapis.com/gmail/v1/users/me/drafts");
    expect(Object.keys(post.body)).toEqual(["message"]);
    const raw = decodeRaw(post.body.message.raw);
    expect(raw).toContain('To: "Lena Fischer" <lena@soliome.com>\r\n');
    expect(raw).toContain("Subject: Following up\r\n");
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(decodeBody(raw)).toBe("Hi Lena,\r\n\r\nAny news?");

    expect(decided).toMatchObject({
      status: "approved",
      result: {
        draftId: "r-draft-1",
        webLink:
          "https://mail.google.com/mail/u/simone%40simonepaz.com/#drafts?compose=msg-draft-1",
        threadId: "thread-lena",
        taskId
      }
    });
    const [task] = await db.select().from(t.tasks).where(eq(t.tasks.id, taskId));
    expect(task).toMatchObject({ status: "waiting", emailThreadId: "thread-lena" });
  });

  it("keeps the approval pending when Gmail fails", async () => {
    routes[`${GMAIL}/drafts`] = () => json({ error: { code: 503 } }, 503);
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

describe("Mail helpers", () => {
  it("parses address lists with quoted commas and bare addresses", () => {
    expect(
      parseAddressList(
        '"Rivera, Jordan" <Jordan@AlgaeWorks.com>, priya@mycoform.io, Lena <lena@x.com>'
      )
    ).toEqual([
      { name: "Rivera, Jordan", address: "jordan@algaeworks.com" },
      { name: null, address: "priya@mycoform.io" },
      { name: "Lena", address: "lena@x.com" }
    ]);
    expect(parseAddressList(undefined)).toEqual([]);
    expect(parseAddressList("undisclosed-recipients:;")).toEqual([]);
  });

  it("encodes non-ASCII names and subjects as RFC 2047 words", () => {
    const raw = decodeRaw(
      rawMessage({ to: "jose@x.com", toName: "José Núñez", subject: "Café ☕", body: "Olá" })
    );
    const b = (s: string) => `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`;
    expect(raw).toContain(`To: ${b("José Núñez")} <jose@x.com>\r\n`);
    expect(raw).toContain(`Subject: ${b("Café ☕")}\r\n`);
    expect(decodeBody(raw)).toBe("Olá");
    // Header injection through the subject is flattened onto one line.
    expect(
      decodeRaw(rawMessage({ to: "a@x.com", subject: "Hi\r\nBcc: evil@x.com", body: "x" }))
    ).toContain("Subject: Hi Bcc: evil@x.com\r\n");
  });
});

describe("Reply check", () => {
  const me = new Set([ME]);
  const sent = (at: string) => msg("s", { labels: ["SENT"], from: `Simone <${ME}>`, at });
  const got = (at: string) => msg("r", { labels: ["INBOX"], from: "Lena <lena@soliome.com>", at });

  it("counts only a reply newer than her last sent message", () => {
    expect(threadHasReply([sent(day(3)), got(day(1))], me)).toBe(true);
    expect(threadHasReply([got(day(5)), sent(day(3))], me)).toBe(false);
    // Draft not sent yet: nothing to reply to.
    expect(threadHasReply([{ ...sent(day(3)), labelIds: ["DRAFT"] }, got(day(1))], me)).toBe(false);
  });

  it("moves a waiting task to replied when a reply arrives", async () => {
    const quiet = await A.createTask.run({ title: "Chase Priya", status: "waiting" }, ctx());
    await db.update(t.tasks).set({ emailThreadId: "thread-priya" }).where(eq(t.tasks.id, quiet.id));
    // Draft deleted in Gmail: the thread is gone and the task just keeps waiting.
    const gone = await A.createTask.run({ title: "Deleted draft", status: "waiting" }, ctx());
    await db.update(t.tasks).set({ emailThreadId: "thread-gone" }).where(eq(t.tasks.id, gone.id));

    routes[`${GMAIL}/threads/thread-lena`] = () => json({ messages: [sent(day(2)), got(day(1))] });
    routes[`${GMAIL}/threads/thread-priya`] = () => json({ messages: [sent(day(2))] });

    const result = await A.checkOutlookReplies.run({}, ctx());
    expect(result.checked).toBe(3);
    expect(result.replied.map((r) => r.title)).toEqual(["Ask Lena about Soliome"]);
    const threadCall = calls.find((c) => c.url.pathname.endsWith("/threads/thread-lena"))!;
    expect(threadCall.url.searchParams.get("format")).toBe("metadata");

    const rows = await db.select().from(t.tasks);
    expect(rows.find((r) => r.title === "Ask Lena about Soliome")!.status).toBe("replied");
    expect(rows.find((r) => r.title === "Chase Priya")!.status).toBe("waiting");
    expect(rows.find((r) => r.title === "Deleted draft")!.status).toBe("waiting");
    const log = await db
      .select()
      .from(t.activityLog)
      .where(eq(t.activityLog.action, "checkOutlookReplies"));
    expect(log[0].summary).toBe('Replies arrived: "Ask Lena about Soliome"');
  });

  it("skips Google entirely when nothing is waiting", async () => {
    await db.update(t.tasks).set({ status: "done" });
    const result = await A.checkOutlookReplies.run({}, ctx());
    expect(result).toEqual({ checked: 0, replied: [] });
    expect(calls).toHaveLength(0);
  });
});
