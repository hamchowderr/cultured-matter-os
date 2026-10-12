"use client";

import type { ReactNode } from "react";

import {
  type ApprovalView,
  type ApprovalViews,
  ArgFields,
  BeforeAfter
} from "@/components/chat/approval-view";
import { Badge } from "@/components/ui/badge";
import type { PendingApproval } from "@/lib/agent-controller/events";

// What the assistant's approval cards say in Cultured Matter (the kit's `approvalViews`):
// a plain sentence for each write, and before → after where the agent server sent a preview
// (agent/…/lib/approval-preview.ts: the Fluent plugins' and the page tool's dry runs, and a
// contact as it is now). A tool not listed here gets the kit's card: its name in words and
// its arguments as fields.

type Args = Record<string, unknown>;
const args = (a: PendingApproval) => (a.args ?? {}) as Args;
const text = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const quoted = (v: unknown) => (text(v) ? `“${text(v)}”` : "");

function Lines({ children }: { children: ReactNode }) {
  return <div className="space-y-2 text-sm">{children}</div>;
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

const simple =
  (title: (a: Args) => string, body?: (a: Args) => ReactNode) =>
  (approval: PendingApproval): ApprovalView => ({
    title: title(args(approval)),
    body: body?.(args(approval))
  });

const withNote = (a: Args) => (text(a.note) ? <Line label="Note">{text(a.note)}</Line> : null);

// ---------------------------------------------------------------- Website pages

/** "/" is the home page; "/series" the Series page. */
export function pageName(path: unknown) {
  const p = text(path);
  if (!p || p === "/") return "home";
  const last = p.replace(/\/+$/, "").split("/").pop() ?? p;
  const words = last.replace(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : p;
}

type PagePreview = {
  path?: string | null;
  status?: string | null;
  title?: { before?: string; after?: string } | null;
  changes?: { path: string; before?: Record<string, string>; after?: Record<string, string> }[];
};

const BLOCK_FIELDS: [string, string][] = [
  ["text", "Text"],
  ["href", "Link"],
  ["url", "Image"],
  ["alt", "Image description"],
  ["html", "HTML"]
];

function LiveBadge({ live }: { live: boolean }) {
  return (
    <Badge variant={live ? "default" : "secondary"}>
      {live ? "Live: changes show on the site at once" : "Draft: not on the site yet"}
    </Badge>
  );
}

function updatePage(approval: PendingApproval): ApprovalView {
  const a = args(approval) as {
    page?: string;
    live?: boolean;
    title?: { before?: string; after?: string };
    changes?: { path: string; before?: Record<string, string>; after?: Record<string, string> }[];
  };
  const preview = (approval.preview ?? null) as PagePreview | null;
  const live = preview?.status ? preview.status === "publish" : !!a.live;
  const changes = preview?.changes?.length ? preview.changes : (a.changes ?? []);
  const title = preview?.title?.after !== undefined ? preview.title : a.title;
  return {
    title: `Update the ${pageName(preview?.path ?? a.page)} page`,
    body: (
      <Lines>
        <LiveBadge live={live} />
        {title && <BeforeAfter label="Page title" before={title.before} after={title.after} />}
        {changes.map((c) =>
          BLOCK_FIELDS.filter(([key]) => c.after?.[key] !== undefined).map(([key, label]) => (
            <BeforeAfter
              key={`${c.path}-${key}`}
              label={label}
              before={stripTags(c.before?.[key])}
              after={stripTags(c.after?.[key])}
            />
          ))
        )}
      </Lines>
    )
  };
}

/** Inline HTML (em, strong, a) shown as its words. */
function stripTags(v: unknown) {
  return text(v)
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

const createPage = simple(
  (a) => `Create a draft page ${quoted(a.title)}`,
  (a) => (
    <Lines>
      <LiveBadge live={false} />
      {a.template_page_id ? <p>It starts as a copy of another page’s layout and words.</p> : null}
      {text(a.slug) ? <Line label="Address">/{text(a.slug)}</Line> : null}
    </Lines>
  )
);

// ---------------------------------------------------------------- FluentCRM

type ContactPreview = { exists?: boolean; contact?: Record<string, unknown> };

const CONTACT_FIELDS: [string, string][] = [
  ["first_name", "First name"],
  ["last_name", "Last name"],
  ["new_email", "Email"],
  ["phone", "Phone"],
  ["status", "Status"],
  ["contact_type", "Type"]
];

function listText(v: unknown) {
  return Array.isArray(v) ? v.map(text).filter(Boolean).join(", ") : text(v);
}

function upsertContact(approval: PendingApproval): ApprovalView {
  const a = args(approval);
  const preview = (approval.preview ?? null) as ContactPreview | null;
  const before = preview?.exists ? (preview.contact ?? {}) : null;
  const name =
    [text(a.first_name), text(a.last_name)].filter(Boolean).join(" ") ||
    [text(before?.first_name), text(before?.last_name)].filter(Boolean).join(" ") ||
    text(a.email) ||
    "this contact";
  const changes = CONTACT_FIELDS.filter(([key]) => a[key] !== undefined);
  return {
    title: before ? `Update ${name} in your contacts` : `Add ${name} to your contacts`,
    body: (
      <Lines>
        {text(a.email) && <Line label="Email">{text(a.email)}</Line>}
        {changes.map(([key, label]) =>
          before ? (
            <BeforeAfter
              key={key}
              label={label}
              before={text(before[key === "new_email" ? "email" : key])}
              after={text(a[key])}
            />
          ) : (
            <Line key={key} label={label}>
              {text(a[key])}
            </Line>
          )
        )}
        {listText(a.add_tags) && <Line label="Add tags">{listText(a.add_tags)}</Line>}
        {listText(a.remove_tags) && <Line label="Remove tags">{listText(a.remove_tags)}</Line>}
        {listText(a.add_lists) && <Line label="Add to lists">{listText(a.add_lists)}</Line>}
        {listText(a.remove_lists) && (
          <Line label="Remove from lists">{listText(a.remove_lists)}</Line>
        )}
      </Lines>
    )
  };
}

const addContactNote = simple(
  (a) => `Add a note to ${text(a.email) || "the contact"}: ${quoted(a.title)}`,
  (a) => <p className="text-sm whitespace-pre-wrap">{stripTags(a.description)}</p>
);

const manageSegment = (kind: "tag" | "list") =>
  simple((a) =>
    a.action === "update"
      ? `Rename the ${kind} to ${quoted(a.title)}`
      : `Create the ${kind} ${quoted(a.title)}`
  );

const upsertCampaign = simple(
  (a) =>
    a.campaign_id
      ? `Update the campaign draft ${quoted(a.title)}`
      : `Save a campaign draft ${quoted(a.title)}`,
  (a) => (
    <Lines>
      <p className="text-muted-foreground">A draft only: nothing is sent or scheduled.</p>
      {text(a.email_subject) && <Line label="Subject">{text(a.email_subject)}</Line>}
    </Lines>
  )
);

// ---------------------------------------------------------------- Fluent Forms and Booking

type FromTo = { from?: unknown; to?: unknown };
const isFromTo = (v: unknown): v is FromTo =>
  !!v && typeof v === "object" && ("from" in v || "to" in v);

/** A plugin dry run as changes: every { from, to } as before → after, keys as fields. */
function DryRun({ preview }: { preview: unknown }) {
  if (!preview || typeof preview !== "object") return null;
  const p = preview as Record<string, unknown>;
  const changes = (p.changes && typeof p.changes === "object" ? p.changes : p) as Record<
    string,
    unknown
  >;
  const rows = Object.entries(changes).filter(([, v]) => isFromTo(v));
  const keyList = (key: string, label: string) =>
    Array.isArray(p[key]) && (p[key] as unknown[]).length ? (
      <Line label={label}>{listText(p[key])}</Line>
    ) : null;
  return (
    <Lines>
      {rows.map(([key, v]) => (
        <BeforeAfter
          key={key}
          label={key.replace(/_/g, " ")}
          before={text((v as FromTo).from)}
          after={text((v as FromTo).to)}
        />
      ))}
      {keyList("new_field_keys", "Fields added")}
      {keyList("removed_field_keys", "Fields removed")}
      {text(p.warning) && <p className="text-amber-700 dark:text-amber-400">{text(p.warning)}</p>}
      {!rows.length && !p.new_field_keys && !p.removed_field_keys && <ArgFields value={p} />}
    </Lines>
  );
}

const withPreview =
  (title: (a: Args) => string) =>
  (approval: PendingApproval): ApprovalView => ({
    title: title(args(approval)),
    body:
      approval.preview !== undefined ? (
        <DryRun preview={approval.preview} />
      ) : (
        <ArgFields value={approval.args} />
      )
  });

// ---------------------------------------------------------------- The app's own writes

const STATUS: Record<string, string> = {
  todo: "to do",
  in_progress: "in progress",
  waiting: "waiting for a response",
  replied: "replied",
  done: "done",
  watching: "watching",
  applying: "applying",
  submitted: "submitted",
  passed: "passed"
};
const status = (v: unknown) => STATUS[text(v)] ?? text(v);

export const approvalViews: ApprovalViews = {
  "cultured-matter-update-page": updatePage,
  "cultured-matter-create-page": createPage,
  "fluent-crm-upsert-contact": upsertContact,
  "fluent-crm-add-contact-note": addContactNote,
  "fluent-crm-manage-tag": manageSegment("tag"),
  "fluent-crm-manage-list": manageSegment("list"),
  "fluent-crm-upsert-campaign": upsertCampaign,
  "fluentform-upsert-email-notification": withPreview((a) =>
    a.notification_id ? "Change a form’s email notification" : "Add an email notification to a form"
  ),
  "fluentform-update-form-fields": withPreview(() => "Change a form’s fields"),
  "fluentform-update-form-styling": withPreview(() => "Change a form’s look"),
  "fluent-booking-create-booking": withPreview(
    (a) => `Book ${text(a.name) || "a meeting"} for ${text(a.start_time)}`
  ),
  "fluent-booking-manage-booking": withPreview(
    (a) => `${text(a.action).replace(/_/g, " ") || "Change"} a booking`
  ),

  createTask: simple(
    (a) => `Add the task ${quoted(a.title)}${text(a.dueDate) ? `, due ${text(a.dueDate)}` : ""}`
  ),
  updateTask: simple(
    () => "Change a task",
    (a) => <ArgFields value={a} />
  ),
  setTaskStatus: simple((a) => `Mark a task as ${status(a.status)}`),
  createProject: simple((a) => `Create the project ${quoted(a.name)}`),
  updateProject: simple(
    () => "Change a project",
    (a) => <ArgFields value={a} />
  ),
  deleteProject: simple(() => "Delete a project (it has no tasks of its own)"),
  linkTaskToProject: simple(() => "Show a task in another project too"),
  unlinkTaskFromProject: simple(() => "Take a task out of a project it was linked into"),
  createCapture: simple(
    () => "Add a note to the Inbox",
    (a) => <p className="text-sm whitespace-pre-wrap">{text(a.body)}</p>
  ),
  classifyCapture: simple((a) => `File an Inbox item as ${text(a.kind) || "an item"}`),
  fileNoteToInbox: simple(() => "Copy a note into the Inbox"),
  setGrantStatus: simple((a) => `Move a grant to ${status(a.status)}`),
  draftGrantApplication: simple(
    () => "Draft the application for this grant",
    () => <p className="text-sm">It replaces any earlier draft saved with the grant.</p>
  ),
  updateGrantApplication: simple(() => "Save changes to a grant application"),
  starCompany: simple(() => "Star a radar company", withNote),
  shortlistCompany: simple(() => "Shortlist a radar company", withNote),
  passCompany: simple(() => "Pass on a radar company", withNote),
  resetCompany: simple(() => "Put a radar company back to unreviewed"),
  addPairing: simple(
    (a) => `Pair ${text(a.brandName) || "a brand"} with a radar company`,
    withNote
  ),
  removePairing: simple(() => "Remove a brand pairing"),
  linkContact: simple(() => "Link a contact to a radar company", withNote),
  unlinkContact: simple(() => "Remove a contact’s link to a radar company"),
  setContactSectors: simple((a) => `Set a contact’s sectors to ${listText(a.sectors) || "none"}`),
  updateBusinessProfile: simple(
    () => "Update your business profile",
    (a) => <ArgFields value={a} />
  ),
  createMindMap: simple((a) => `Create the mind map ${quoted(a.title)}`),
  updateMindMap: simple((a) =>
    text(a.title) ? `Change the mind map ${quoted(a.title)}` : "Change a mind map"
  )
};
