import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

import type { Executor } from "@/db";
import { approvals, contactEmails, contacts, tasks } from "@/db/schema";
import { domainFromEmail } from "@/ingest/radar/types";
import {
  gmail,
  gmailDraftLink,
  gmailMessageLink,
  gmailOptional,
  googleAccount,
  googleSession,
  type GoogleSession,
  mapLimit,
  missingGoogleScopes,
  pageAll,
  parseAddressList,
  people as peopleApi,
  rawMessage
} from "@/lib/google";
import { ActionError, defineAction } from "./define";
import { approvalSchema, id } from "./schemas";

// Gmail and Google Contacts for People. The action names (outlookStatus, syncOutlook,
// checkOutlookReplies) are kept from the Outlook version so screens built in parallel keep
// compiling; everything behind them talks to Google.

// ---------------------------------------------------------------- Google shapes

type GooglePerson = {
  names?: { displayName?: string | null; givenName?: string | null; familyName?: string | null }[];
  emailAddresses?: { value?: string | null }[];
  organizations?: { name?: string | null; title?: string | null }[];
};

type GmailHeader = { name: string; value: string };

export type GmailMessage = {
  id: string;
  threadId?: string | null;
  labelIds?: string[];
  // Milliseconds since the epoch, as a string.
  internalDate?: string | null;
  payload?: { headers?: GmailHeader[] };
};

const MAX_CONTACTS = 2000;
const MAX_MESSAGES = 500;
const HEADERS = ["From", "To", "Cc", "Subject"];

const clean = (v: string | null | undefined) => v?.trim() || null;
const header = (m: GmailMessage, name: string) =>
  m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
const isDraft = (m: GmailMessage) => m.labelIds?.includes("DRAFT") ?? false;
const sentAt = (m: GmailMessage) => Number(m.internalDate) || 0;

// Mail from systems, not people; never turned into contacts.
const AUTOMATED =
  /^(no-?reply|do-?not-?reply|notifications?|notify|mailer-daemon|postmaster|bounces?|newsletters?|alerts?|updates?)([+._-].*)?@/i;

// ---------------------------------------------------------------- Sync Gmail

type Person = {
  email: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  position: string | null;
};

type LoggedMessage = {
  id: string;
  conversationId: string | null;
  subject: string | null;
  direction: "in" | "out";
  at: Date;
  webLink: string;
  // Inbound: the sender. Outbound: To and Cc.
  participants: string[];
};

type Snapshot = { people: Person[]; messages: LoggedMessage[] };

export async function fetchGmailSnapshot(session: GoogleSession, days: number) {
  const [connections, otherContacts, messages] = await Promise.all([
    pageAll<GooglePerson, "connections">(
      (pageToken) =>
        peopleApi(session, "/people/me/connections", {
          personFields: "names,emailAddresses,organizations",
          pageSize: 1000,
          pageToken
        }),
      "connections",
      MAX_CONTACTS
    ),
    // People she has emailed that Gmail saved on its own; only used for their names.
    pageAll<GooglePerson, "otherContacts">(
      (pageToken) =>
        peopleApi(session, "/otherContacts", {
          readMask: "names,emailAddresses",
          pageSize: 1000,
          pageToken
        }),
      "otherContacts",
      MAX_CONTACTS
    ),
    fetchRecentMessages(session, days)
  ]);
  return toSnapshot(session, connections, otherContacts, messages);
}

async function fetchRecentMessages(session: GoogleSession, days: number) {
  const ids = await pageAll<{ id: string }, "messages">(
    (pageToken) =>
      gmail(session, "/messages", {
        query: { q: `newer_than:${days}d -in:drafts -in:chats`, maxResults: 100, pageToken }
      }),
    "messages",
    MAX_MESSAGES
  );
  return mapLimit(ids, 8, (m) =>
    gmail<GmailMessage>(session, `/messages/${encodeURIComponent(m.id)}`, {
      query: { format: "metadata", metadataHeaders: HEADERS }
    })
  );
}

function personFrom(email: string, name: string | null): Person {
  const fullName = name && name.toLowerCase() !== email ? name : email;
  const [firstName, ...rest] = fullName === email ? [null] : fullName.split(/\s+/);
  return {
    email,
    fullName,
    firstName: firstName ?? null,
    lastName: rest.length ? rest.join(" ") : null,
    company: null,
    position: null
  };
}

function toSnapshot(
  session: GoogleSession,
  connections: GooglePerson[],
  otherContacts: GooglePerson[],
  list: GmailMessage[]
): Snapshot {
  const { me } = session;
  const firstEmail = (p: GooglePerson) =>
    p.emailAddresses
      ?.map((e) => clean(e.value)?.toLowerCase())
      .find((e): e is string => !!e && e.includes("@"));

  const people = new Map<string, Person>();
  // Her Google contacts first: they carry company and job title.
  for (const c of connections) {
    const email = firstEmail(c);
    if (!email || me.has(email) || people.has(email)) continue;
    const name = c.names?.[0];
    const org = c.organizations?.[0];
    const firstName = clean(name?.givenName);
    const lastName = clean(name?.familyName);
    people.set(email, {
      email,
      fullName:
        clean(name?.displayName) || [firstName, lastName].filter(Boolean).join(" ") || email,
      firstName,
      lastName,
      company: clean(org?.name),
      position: clean(org?.title)
    });
  }
  const otherNames = new Map<string, string>();
  for (const c of otherContacts) {
    const email = firstEmail(c);
    const name = clean(c.names?.[0]?.displayName);
    if (email && name) otherNames.set(email, name);
  }

  const messages: LoggedMessage[] = [];
  const seen = new Set<string>();
  for (const m of list) {
    if (!m || isDraft(m) || seen.has(m.id)) continue;
    seen.add(m.id);
    const at = new Date(sentAt(m));
    if (!sentAt(m)) continue;
    const from = parseAddressList(header(m, "From"))[0];
    const direction = m.labelIds?.includes("SENT") || (from && me.has(from.address)) ? "out" : "in";
    const mailboxes =
      direction === "in"
        ? from
          ? [from]
          : []
        : [...parseAddressList(header(m, "To")), ...parseAddressList(header(m, "Cc"))];
    const others = mailboxes.filter((b) => !me.has(b.address));
    // Then people who wrote to her, or she wrote to, recently.
    for (const b of others) {
      if (people.has(b.address) || AUTOMATED.test(b.address)) continue;
      people.set(
        b.address,
        personFrom(b.address, clean(b.name) ?? otherNames.get(b.address) ?? null)
      );
    }
    messages.push({
      id: m.id,
      conversationId: clean(m.threadId),
      subject: clean(header(m, "Subject")),
      direction,
      at,
      webLink: gmailMessageLink(session.mailbox, m.id),
      participants: [...new Set(others.map((b) => b.address))]
    });
  }
  return { people: [...people.values()], messages };
}

const CHUNK = 100;

async function contactsByEmail(db: Executor) {
  const rows = await db
    .select({ id: contacts.id, email: contacts.email })
    .from(contacts)
    .where(isNotNull(contacts.email));
  return new Map(rows.map((r) => [r.email!.toLowerCase(), r.id]));
}

export const syncOutlook = defineAction({
  name: "syncOutlook",
  description:
    "Import Google contacts and people she emailed with recently in Gmail into People (matched by email, never duplicated), and log recent emails with each contact. One-way: nothing is changed in Gmail or Google Contacts.",
  kind: "write",
  input: z.object({ days: z.number().int().min(1).max(365).default(60) }),
  output: z.object({ created: z.number(), matched: z.number(), emailsLogged: z.number() }),
  async prepare(input, db) {
    return fetchGmailSnapshot(await googleSession(db), input.days);
  },
  async handler(_input, db, snapshot) {
    const known = await contactsByEmail(db);
    const fresh = snapshot.people.filter((p) => !known.has(p.email));
    const matched = snapshot.people.filter((p) => known.has(p.email));

    for (let i = 0; i < fresh.length; i += CHUNK) {
      await db
        .insert(contacts)
        .values(
          fresh.slice(i, i + CHUNK).map((p) => ({
            ...p,
            companyDomain: domainFromEmail(p.email),
            source: "google" as const
          }))
        )
        .onConflictDoNothing();
    }
    // Existing contacts keep their LinkedIn data; Google only fills what is blank.
    for (const p of matched) {
      if (!p.company && !p.position && !p.firstName && !p.lastName) continue;
      await db
        .update(contacts)
        .set({
          company: sql`coalesce(${contacts.company}, ${p.company})`,
          position: sql`coalesce(${contacts.position}, ${p.position})`,
          firstName: sql`coalesce(${contacts.firstName}, ${p.firstName})`,
          lastName: sql`coalesce(${contacts.lastName}, ${p.lastName})`
        })
        .where(eq(contacts.id, known.get(p.email)!));
    }

    const ids = fresh.length ? await contactsByEmail(db) : known;
    const rows: (typeof contactEmails.$inferInsert)[] = [];
    for (const m of snapshot.messages) {
      for (const contactId of new Set(m.participants.map((a) => ids.get(a)).filter(Boolean))) {
        rows.push({
          contactId: contactId!,
          messageId: m.id,
          conversationId: m.conversationId,
          subject: m.subject,
          direction: m.direction,
          at: m.at,
          webLink: m.webLink
        });
      }
    }
    let emailsLogged = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const inserted = await db
        .insert(contactEmails)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoNothing()
        .returning({ id: contactEmails.id });
      emailsLogged += inserted.length;
    }
    return { created: fresh.length, matched: matched.length, emailsLogged };
  },
  log: (_input, r) => ({
    entityType: "contact",
    summary: `Synced Gmail: ${r.created} new ${r.created === 1 ? "person" : "people"}, ${r.emailsLogged} emails logged`,
    data: r
  })
});

// ---------------------------------------------------------------- Reading

export const contactEmailSchema = createSelectSchema(contactEmails);
export type ContactEmail = z.infer<typeof contactEmailSchema>;

export const listContactEmails = defineAction({
  name: "listContactEmails",
  description:
    "A contact's recent Gmail emails, newest first: subject, date, direction and a link to open it in Gmail.",
  kind: "read",
  input: z.object({ contactId: id, limit: z.number().int().min(1).max(100).default(10) }),
  output: z.object({ emails: z.array(contactEmailSchema) }),
  async handler(input, db) {
    const emails = await db
      .select()
      .from(contactEmails)
      .where(eq(contactEmails.contactId, input.contactId))
      .orderBy(desc(contactEmails.at))
      .limit(input.limit);
    return { emails };
  }
});

export const outlookStatus = defineAction({
  name: "outlookStatus",
  description:
    "Whether Google is connected, i.e. Google granted the Gmail and Contacts permissions.",
  kind: "read",
  input: z.object({}),
  output: z.object({ connected: z.boolean(), missingScopes: z.array(z.string()) }),
  async handler(_input, db) {
    const row = await googleAccount(db);
    const missingScopes = missingGoogleScopes(row?.account.scope);
    return { connected: missingScopes.length === 0, missingScopes };
  }
});

// ---------------------------------------------------------------- Follow-up drafts

export const GMAIL_DRAFT = "gmail_draft";

export const gmailDraftPayload = z.object({
  contactId: id,
  taskId: id.nullable(),
  to: z.string().email(),
  toName: z.string(),
  subject: z.string(),
  body: z.string()
});

export const draftFollowUp = defineAction({
  name: "draftFollowUp",
  description:
    "Write a follow-up email to a contact, optionally for a task. It goes to the approval queue; approving saves it in Gmail Drafts for Simone to send herself, and the task then waits for a reply.",
  kind: "write",
  input: z.object({
    contactId: id,
    taskId: id.optional(),
    subject: z.string().trim().min(1, "Add a subject").max(300),
    body: z.string().trim().min(1, "Write the message").max(20_000)
  }),
  output: approvalSchema,
  async handler(input, db) {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, input.contactId));
    if (!contact) throw new ActionError("not_found", "Contact not found");
    if (!contact.email) {
      throw new ActionError("invalid", `${contact.fullName} has no email address`);
    }
    let taskTitle: string | null = null;
    if (input.taskId) {
      const [task] = await db
        .select({ title: tasks.title })
        .from(tasks)
        .where(eq(tasks.id, input.taskId));
      if (!task) throw new ActionError("not_found", "Task not found");
      taskTitle = task.title;
    }
    const payload: z.input<typeof gmailDraftPayload> = {
      contactId: contact.id,
      taskId: input.taskId ?? null,
      to: contact.email,
      toName: contact.fullName,
      subject: input.subject,
      body: input.body
    };
    // Same row requestApproval writes, made here so the draft and its approval are one step.
    const [row] = await db
      .insert(approvals)
      .values({
        action: GMAIL_DRAFT,
        payload,
        summary: `Save a Gmail draft to ${contact.fullName}: "${input.subject.slice(0, 80)}"${
          taskTitle ? ` (task: ${taskTitle.slice(0, 60)})` : ""
        }`
      })
      .returning();
    return row;
  },
  log: (_input, approval) => ({
    entityType: "approval",
    entityId: approval.id,
    summary: `Requested approval: ${approval.summary}`
  }),
  // Same push as requestApproval.
  async after(_input, approval, db) {
    const { sendPush, approvalPush } = await import("@/lib/push");
    await sendPush(db, "approvals", approvalPush(approval));
  }
});

type CreatedDraft = { id: string; message?: { id?: string; threadId?: string | null } };

// Runs inside decideApproval's transaction once a gmail_draft is approved. A Google failure
// throws, which rolls the approval back to pending so it can be approved again.
export async function saveGmailDraft(db: Executor, session: GoogleSession, payload: unknown) {
  const p = gmailDraftPayload.parse(payload);
  const draft = await gmail<CreatedDraft>(session, "/drafts", {
    method: "POST",
    body: { message: { raw: rawMessage(p) } }
  });
  const threadId = draft.message?.threadId ?? null;
  if (p.taskId && threadId) {
    await db
      .update(tasks)
      .set({ emailThreadId: threadId, status: "waiting", completedAt: null })
      .where(eq(tasks.id, p.taskId));
  }
  return {
    draftId: draft.id,
    webLink: draft.message?.id ? gmailDraftLink(session.mailbox, draft.message.id) : null,
    threadId,
    taskId: p.taskId
  };
}

// ---------------------------------------------------------------- Reply check

// Replied when someone else wrote in the thread after her last sent message.
export function threadHasReply(messages: GmailMessage[], me: Set<string>) {
  let lastOut = 0;
  let lastIn = 0;
  for (const m of messages) {
    if (isDraft(m)) continue;
    const from = parseAddressList(header(m, "From"))[0]?.address;
    if (!from) continue;
    if (me.has(from) || m.labelIds?.includes("SENT")) lastOut = Math.max(lastOut, sentAt(m));
    else lastIn = Math.max(lastIn, sentAt(m));
  }
  return lastOut > 0 && lastIn > lastOut;
}

export const checkOutlookReplies = defineAction({
  name: "checkOutlookReplies",
  description:
    "Look at the Gmail thread of every task waiting for a response and move it to replied when a reply has arrived.",
  kind: "write",
  input: z.object({}),
  output: z.object({
    checked: z.number(),
    replied: z.array(z.object({ id: z.string(), title: z.string() }))
  }),
  async prepare(_input, db) {
    const waiting = await db
      .select({ id: tasks.id, threadId: tasks.emailThreadId })
      .from(tasks)
      .where(and(eq(tasks.status, "waiting"), isNotNull(tasks.emailThreadId)));
    if (waiting.length === 0) return { checked: 0, repliedIds: [] as string[] };
    const session = await googleSession(db);
    const repliedIds: string[] = [];
    for (const t of waiting) {
      // A deleted draft takes its thread with it: nothing to watch.
      const thread = await gmailOptional<{ messages?: GmailMessage[] }>(
        session,
        `/threads/${encodeURIComponent(t.threadId!)}`,
        { format: "metadata", metadataHeaders: ["From"] }
      );
      if (thread && threadHasReply(thread.messages ?? [], session.me)) repliedIds.push(t.id);
    }
    return { checked: waiting.length, repliedIds };
  },
  async handler(_input, db, { checked, repliedIds }) {
    const replied = repliedIds.length
      ? await db
          .update(tasks)
          .set({ status: "replied" })
          // Only tasks still waiting: she may have moved one on since the check began.
          .where(and(inArray(tasks.id, repliedIds), eq(tasks.status, "waiting")))
          .returning({ id: tasks.id, title: tasks.title })
      : [];
    return { checked, replied };
  },
  log: (_input, r) => ({
    entityType: "task",
    summary: r.replied.length
      ? `Replies arrived: ${r.replied.map((t) => `"${t.title}"`).join(", ")}`
      : `Checked ${r.checked} waiting ${r.checked === 1 ? "task" : "tasks"} for Gmail replies`,
    data: { replied: r.replied.map((t) => t.id) }
  }),
  // One push for the replies this check found.
  async after(_input, r, db) {
    if (r.replied.length === 0) return;
    const rows = await db
      .select({ title: tasks.title, projectId: tasks.projectId })
      .from(tasks)
      .where(inArray(tasks.id, r.replied.map((t) => t.id)));
    const { sendPush, replyPush } = await import("@/lib/push");
    await sendPush(db, "replies", replyPush(rows));
  }
});
