import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

import type { Executor } from "@/db";
import { approvals, contactEmails, contacts, tasks } from "@/db/schema";
import { domainFromEmail } from "@/ingest/radar/types";
import {
  graph,
  graphAll,
  graphSession,
  type GraphSession,
  microsoftAccount,
  missingGraphScopes,
  odata,
  odataString
} from "@/lib/graph";
import { ActionError, defineAction } from "./define";
import { approvalSchema, id } from "./schemas";

// ---------------------------------------------------------------- Graph shapes

type GraphRecipient = { emailAddress?: { name?: string | null; address?: string | null } };

type GraphContact = {
  givenName?: string | null;
  surname?: string | null;
  displayName?: string | null;
  emailAddresses?: { name?: string | null; address?: string | null }[];
  companyName?: string | null;
  jobTitle?: string | null;
};

export type GraphMessage = {
  id: string;
  conversationId?: string | null;
  subject?: string | null;
  from?: GraphRecipient | null;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  receivedDateTime?: string | null;
  sentDateTime?: string | null;
  webLink?: string | null;
  isDraft?: boolean;
};

const MESSAGE_FIELDS =
  "id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,webLink,isDraft";
const CONTACT_FIELDS = "givenName,surname,displayName,emailAddresses,companyName,jobTitle";
const MAX_CONTACTS = 2000;
const MAX_MESSAGES_PER_FOLDER = 500;

const clean = (v: string | null | undefined) => v?.trim() || null;
const address = (r: GraphRecipient | null | undefined) =>
  clean(r?.emailAddress?.address)?.toLowerCase() ?? null;

// Mail from systems, not people; never turned into contacts.
const AUTOMATED =
  /^(no-?reply|do-?not-?reply|notifications?|notify|mailer-daemon|postmaster|bounces?|newsletters?|alerts?|updates?)([+._-].*)?@/i;

// ---------------------------------------------------------------- Sync Outlook

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
  webLink: string | null;
  // Inbound: the sender. Outbound: To and Cc.
  participants: string[];
};

type Snapshot = { people: Person[]; messages: LoggedMessage[] };

export async function fetchOutlookSnapshot(session: GraphSession, days: number) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [outlookContacts, inbox, sent] = await Promise.all([
    graphAll<GraphContact>(
      session,
      odata("/me/contacts", { select: CONTACT_FIELDS, top: 100 }),
      MAX_CONTACTS
    ),
    // Properties in $orderby must also lead $filter, or Graph rejects the query.
    graphAll<GraphMessage>(
      session,
      odata("/me/mailFolders/inbox/messages", {
        filter: `receivedDateTime ge ${since}`,
        orderby: "receivedDateTime desc",
        select: MESSAGE_FIELDS,
        top: 100
      }),
      MAX_MESSAGES_PER_FOLDER
    ),
    graphAll<GraphMessage>(
      session,
      odata("/me/mailFolders/sentitems/messages", {
        filter: `sentDateTime ge ${since}`,
        orderby: "sentDateTime desc",
        select: MESSAGE_FIELDS,
        top: 100
      }),
      MAX_MESSAGES_PER_FOLDER
    )
  ]);
  return toSnapshot(session.me, outlookContacts, inbox, sent);
}

function toSnapshot(
  me: Set<string>,
  outlookContacts: GraphContact[],
  inbox: GraphMessage[],
  sent: GraphMessage[]
): Snapshot {
  const people = new Map<string, Person>();
  // Outlook contacts first: they carry company and job title.
  for (const c of outlookContacts) {
    const email = c.emailAddresses
      ?.map((a) => clean(a.address)?.toLowerCase())
      .find((a) => a && a.includes("@"));
    if (!email || me.has(email) || people.has(email)) continue;
    const firstName = clean(c.givenName);
    const lastName = clean(c.surname);
    people.set(email, {
      email,
      fullName: clean(c.displayName) || [firstName, lastName].filter(Boolean).join(" ") || email,
      firstName,
      lastName,
      company: clean(c.companyName),
      position: clean(c.jobTitle)
    });
  }
  // Then people who wrote to her recently.
  for (const m of inbox) {
    const email = address(m.from);
    if (!email || m.isDraft || me.has(email) || people.has(email) || AUTOMATED.test(email)) {
      continue;
    }
    const name = clean(m.from?.emailAddress?.name);
    const fullName = name && name.toLowerCase() !== email ? name : email;
    const [firstName, ...rest] = fullName === email ? [null] : fullName.split(/\s+/);
    people.set(email, {
      email,
      fullName,
      firstName: firstName ?? null,
      lastName: rest.length ? rest.join(" ") : null,
      company: null,
      position: null
    });
  }

  const messages: LoggedMessage[] = [];
  for (const [direction, list] of [
    ["in", inbox],
    ["out", sent]
  ] as const) {
    for (const m of list) {
      if (m.isDraft) continue;
      const when = direction === "in" ? m.receivedDateTime : (m.sentDateTime ?? m.receivedDateTime);
      const at = when ? new Date(when) : null;
      if (!at || Number.isNaN(at.getTime())) continue;
      const participants =
        direction === "in"
          ? [address(m.from)]
          : [...(m.toRecipients ?? []), ...(m.ccRecipients ?? [])].map(address);
      messages.push({
        id: m.id,
        conversationId: clean(m.conversationId),
        subject: clean(m.subject),
        direction,
        at,
        webLink: clean(m.webLink),
        participants: participants.filter((a): a is string => !!a && !me.has(a))
      });
    }
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
    "Import Outlook contacts and people who emailed recently into People (matched by email, never duplicated), and log recent emails with each contact. One-way: nothing is changed in Outlook.",
  kind: "write",
  input: z.object({ days: z.number().int().min(1).max(365).default(60) }),
  output: z.object({ created: z.number(), matched: z.number(), emailsLogged: z.number() }),
  async prepare(input, db) {
    return fetchOutlookSnapshot(await graphSession(db), input.days);
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
            source: "outlook" as const
          }))
        )
        .onConflictDoNothing();
    }
    // Existing contacts keep their LinkedIn data; Outlook only fills what is blank.
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
    summary: `Synced Outlook: ${r.created} new ${r.created === 1 ? "person" : "people"}, ${r.emailsLogged} emails logged`,
    data: r
  })
});

// ---------------------------------------------------------------- Reading

export const contactEmailSchema = createSelectSchema(contactEmails);
export type ContactEmail = z.infer<typeof contactEmailSchema>;

export const listContactEmails = defineAction({
  name: "listContactEmails",
  description:
    "A contact's recent Outlook emails, newest first: subject, date, direction and a link to open it in Outlook.",
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
    "Whether Outlook is connected, i.e. Microsoft granted the contacts and mail permissions.",
  kind: "read",
  input: z.object({}),
  output: z.object({ connected: z.boolean(), missingScopes: z.array(z.string()) }),
  async handler(_input, db) {
    const row = await microsoftAccount(db);
    const missingScopes = row ? missingGraphScopes(row.account.scope) : missingGraphScopes(null);
    return { connected: missingScopes.length === 0, missingScopes };
  }
});

// ---------------------------------------------------------------- Follow-up drafts

export const OUTLOOK_DRAFT = "outlook_draft";

export const outlookDraftPayload = z.object({
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
    "Write a follow-up email to a contact, optionally for a task. It goes to the approval queue; approving saves it in Outlook Drafts for Simone to send herself, and the task then waits for a reply.",
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
    const payload: z.input<typeof outlookDraftPayload> = {
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
        action: OUTLOOK_DRAFT,
        payload,
        summary: `Save an Outlook draft to ${contact.fullName}: "${input.subject.slice(0, 80)}"${
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
  })
});

type CreatedDraft = { id: string; webLink?: string | null; conversationId?: string | null };

// Runs inside decideApproval's transaction once an outlook_draft is approved. A Graph failure
// throws, which rolls the approval back to pending so it can be approved again.
export async function saveOutlookDraft(db: Executor, session: GraphSession, payload: unknown) {
  const p = outlookDraftPayload.parse(payload);
  const draft = await graph<CreatedDraft>(session, "/me/messages", {
    method: "POST",
    body: {
      subject: p.subject,
      body: { contentType: "Text", content: p.body },
      toRecipients: [{ emailAddress: { address: p.to, name: p.toName } }]
    }
  });
  if (p.taskId && draft.conversationId) {
    await db
      .update(tasks)
      .set({ outlookConversationId: draft.conversationId, status: "waiting", completedAt: null })
      .where(eq(tasks.id, p.taskId));
  }
  return {
    draftId: draft.id,
    webLink: draft.webLink ?? null,
    conversationId: draft.conversationId ?? null,
    taskId: p.taskId
  };
}

// ---------------------------------------------------------------- Reply check

// Replied when someone else wrote in the thread after her last sent message.
export function threadHasReply(messages: GraphMessage[], me: Set<string>) {
  let lastOut = 0;
  let lastIn = 0;
  for (const m of messages) {
    if (m.isDraft) continue;
    const from = address(m.from);
    if (!from) continue;
    if (me.has(from)) {
      lastOut = Math.max(lastOut, Date.parse(m.sentDateTime ?? m.receivedDateTime ?? "") || 0);
    } else {
      lastIn = Math.max(lastIn, Date.parse(m.receivedDateTime ?? "") || 0);
    }
  }
  return lastOut > 0 && lastIn > lastOut;
}

export const checkOutlookReplies = defineAction({
  name: "checkOutlookReplies",
  description:
    "Look at the Outlook thread of every task waiting for a response and move it to replied when a reply has arrived.",
  kind: "write",
  input: z.object({}),
  output: z.object({
    checked: z.number(),
    replied: z.array(z.object({ id: z.string(), title: z.string() }))
  }),
  async prepare(_input, db) {
    const waiting = await db
      .select({ id: tasks.id, conversationId: tasks.outlookConversationId })
      .from(tasks)
      .where(and(eq(tasks.status, "waiting"), isNotNull(tasks.outlookConversationId)));
    if (waiting.length === 0) return { checked: 0, repliedIds: [] as string[] };
    const session = await graphSession(db);
    const repliedIds: string[] = [];
    for (const t of waiting) {
      const thread = await graphAll<GraphMessage>(
        session,
        odata("/me/messages", {
          filter: `conversationId eq ${odataString(t.conversationId!)}`,
          select: "from,receivedDateTime,sentDateTime,isDraft",
          top: 50
        }),
        200
      );
      if (threadHasReply(thread, session.me)) repliedIds.push(t.id);
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
      : `Checked ${r.checked} waiting ${r.checked === 1 ? "task" : "tasks"} for Outlook replies`,
    data: { replied: r.replied.map((t) => t.id) }
  })
});
