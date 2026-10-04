"use client";

import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { BellIcon, FileTextIcon, FolderIcon, LinkIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";
import { toast } from "sonner";

import type { Approval, Company, Contact, Grant, Task } from "@/actions/schemas";
import { decideApproval } from "@/actions/server";
import { ApprovalCard, CompanyCard, ContactCard, GrantCard, TaskCard } from "@/components/cards";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput
} from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";

// Tool results render as the app's own prop-driven cards, inline in the conversation.

type Part = ToolUIPart | DynamicToolUIPart;

export function toolNameOf(part: Part): string {
  return part.type === "dynamic-tool" ? part.toolName : part.type.slice("tool-".length);
}

// JSON turns dates into strings; the cards want Date objects back.
const DATE_KEYS = /(At|^deadline|^dueDate|^at)$/;
export function reviveDates<T>(value: T): T {
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(reviveDates) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        typeof v === "string" && DATE_KEYS.test(k) && !Number.isNaN(Date.parse(v))
          ? new Date(v)
          : reviveDates(v)
      ])
    ) as T;
  }
  return value;
}

// What she sees while a tool runs.
const RUNNING: Record<string, string> = {
  searchCompanies: "Searching Radar…",
  getCompany: "Opening the company…",
  searchGrants: "Searching grants…",
  searchContacts: "Searching your contacts…",
  findWarmPath: "Looking for warm paths…",
  contactWarmPaths: "Looking for warm paths…",
  listNotifications: "Checking what's new…",
  searchNotes: "Searching your notes…",
  getNote: "Opening the note…",
  listTasks: "Looking at your tasks…",
  dueTasks: "Looking at what's due…",
  listProjects: "Looking at your projects…",
  getProject: "Opening the project…",
  listApprovals: "Checking approvals…"
};

const SHOWN = 4;

function CardList<T>({
  items,
  render,
  empty
}: {
  items: T[];
  render: (item: T) => ReactNode;
  empty: string;
}) {
  const [all, setAll] = useState(false);
  if (items.length === 0) return <p className="text-muted-foreground text-sm">{empty}</p>;
  const visible = all ? items : items.slice(0, SHOWN);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {visible.map(render)}
      {items.length > SHOWN && !all && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setAll(true)}>
          Show {items.length - SHOWN} more
        </Button>
      )}
    </div>
  );
}

function LinkRow({
  href,
  icon,
  title,
  detail
}: {
  href: string;
  icon: ReactNode;
  title: string;
  detail?: string;
}) {
  return (
    <Link
      href={href}
      className="hover:bg-muted flex min-w-0 items-start gap-2 rounded-md border p-3 text-sm"
    >
      <span className="text-muted-foreground mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{title}</span>
        {detail && <span className="text-muted-foreground line-clamp-2 block">{detail}</span>}
      </span>
    </Link>
  );
}

// Approvals decided since the conversation was saved (on Today, or in another chat), by id.
export const ApprovalStatuses = createContext<Record<string, Approval["status"]>>({});

// An approval card she can act on. Its status is the one stored in the conversation until she
// decides here; a card decided elsewhere is told "already decided" and shows that.
export function ChatApproval({
  approval: initial,
  onDecided
}: {
  approval: Approval;
  onDecided?: (approval: Approval) => void;
}) {
  const decidedElsewhere = useContext(ApprovalStatuses)[initial.id];
  const [approval, setApproval] = useState(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const shown =
    approval.status === "pending" && decidedElsewhere
      ? { ...approval, status: decidedElsewhere }
      : approval;

  async function decide(decision: "approve" | "reject", note?: string) {
    setBusy(true);
    const result = await decideApproval({ approvalId: approval.id, decision, note });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error.message);
      if (result.error.code === "conflict") {
        // "This approval was already approved" (or rejected): show what really happened.
        const already = /already (approved|rejected)/.exec(result.error.message)?.[1];
        if (already) setApproval({ ...approval, status: already as Approval["status"] });
      }
      return;
    }
    const decided = reviveDates(result.data) as Approval;
    setApproval(decided);
    onDecided?.(decided);
    toast.success(decision === "approve" ? "Done" : "Rejected");
    // Pages behind the chat show the change.
    router.refresh();
  }

  return (
    <ApprovalCard
      approval={shown}
      busy={busy}
      onApprove={() => decide("approve")}
      onReject={(note) => decide("reject", note)}
    />
  );
}

type WarmPath = { contact: Contact; via: string; target: string; reason: string };
type ContactPath = {
  companyId: string;
  companyName: string;
  target: string;
  reason: string;
  via: string;
};
type Notification = { id: string; title: string; description: string; href: string };
type NoteSummary = { id: string; title: string; preview: string };
type ProjectSummary = { id: string; name: string; business: string; open: number };

function pathReason(reason: string, target: string) {
  return reason === "works_at" ? `Works at ${target}` : `Linked to ${target}`;
}

// The card (or list of cards) for one finished tool call, or null to fall back to the
// generic tool view.
function cardsFor(name: string, output: Record<string, unknown>, open: (href: string) => void) {
  const o = reviveDates(output);
  switch (name) {
    case "searchCompanies":
      return (
        <CardList
          items={(o.companies as (Company & { sources: string[] })[]) ?? []}
          empty="No companies found."
          render={(c) => (
            <CompanyCard
              key={c.id}
              company={c}
              sources={c.sources}
              onOpen={() => open(`/radar?company=${encodeURIComponent(c.id)}`)}
            />
          )}
        />
      );
    case "getCompany": {
      const c = o.company as Company;
      return (
        <CompanyCard
          company={c}
          sources={(o.sightings as { source: string }[]).map((s) => s.source)}
          onOpen={() => open(`/radar?company=${encodeURIComponent(c.id)}`)}
        />
      );
    }
    case "searchGrants":
      return (
        <CardList
          items={(o.grants as Grant[]) ?? []}
          empty="No grants found."
          render={(g) => <GrantCard key={g.id} grant={g} />}
        />
      );
    case "searchContacts":
      return (
        <CardList
          items={(o.contacts as Contact[]) ?? []}
          empty="No contacts found."
          render={(c) => <ContactCard key={c.id} contact={c} />}
        />
      );
    case "findWarmPath":
      return (
        <CardList
          items={(o.paths as WarmPath[]) ?? []}
          empty="No one in your contacts can introduce you yet."
          render={(p) => (
            <ContactCard
              key={`${p.contact.id}-${p.target}`}
              contact={p.contact}
              reason={pathReason(p.reason, p.target)}
            />
          )}
        />
      );
    case "contactWarmPaths":
      return (
        <CardList
          items={(o.paths as ContactPath[]) ?? []}
          empty="No warm paths from this contact yet."
          render={(p) => (
            <LinkRow
              key={`${p.companyId}-${p.target}`}
              href={`/radar?company=${encodeURIComponent(p.companyId)}`}
              icon={<LinkIcon />}
              title={p.companyName}
              detail={pathReason(p.reason, p.target)}
            />
          )}
        />
      );
    case "listTasks":
    case "dueTasks": {
      const tasks = (
        name === "dueTasks"
          ? [
              ...((o.overdue as Task[]) ?? []),
              ...((o.today as Task[]) ?? []),
              ...((o.week as Task[]) ?? [])
            ]
          : ((o.tasks as Task[]) ?? [])
      ) as (Task & { projectName?: string | null })[];
      return (
        <CardList
          items={tasks}
          empty="No tasks."
          render={(t) => (
            <TaskCard
              key={t.id}
              task={t}
              projectName={t.projectName ?? undefined}
              onOpen={t.projectId ? () => open(`/projects?p=${t.projectId}`) : undefined}
            />
          )}
        />
      );
    }
    case "getProject":
      return (
        <CardList
          items={(o.tasks as Task[]) ?? []}
          empty="This project has no tasks yet."
          render={(t) => (
            <TaskCard key={t.id} task={t} projectName={(o.project as { name: string }).name} />
          )}
        />
      );
    case "listProjects":
      return (
        <CardList
          items={(o.projects as ProjectSummary[]) ?? []}
          empty="No projects."
          render={(p) => (
            <LinkRow
              key={p.id}
              href={`/projects?p=${p.id}`}
              icon={<FolderIcon />}
              title={p.name}
              detail={`${p.business} · ${p.open} open`}
            />
          )}
        />
      );
    case "listNotifications":
      return (
        <CardList
          items={(o.items as Notification[]) ?? []}
          empty="Nothing new."
          render={(n) => (
            <LinkRow
              key={n.id}
              href={n.href}
              icon={<BellIcon />}
              title={n.title}
              detail={n.description}
            />
          )}
        />
      );
    case "searchNotes":
      return (
        <CardList
          items={(o.notes as NoteSummary[]) ?? []}
          empty="No notes found."
          render={(n) => (
            <LinkRow
              key={n.id}
              href={`/archive/notes?note=${n.id}`}
              icon={<FileTextIcon />}
              title={n.title}
              detail={n.preview}
            />
          )}
        />
      );
    case "getNote": {
      const n = o as unknown as NoteSummary;
      return (
        <LinkRow href={`/archive/notes?note=${n.id}`} icon={<FileTextIcon />} title={n.title} />
      );
    }
    case "listApprovals":
      return (
        <CardList
          items={(o.approvals as Approval[]) ?? []}
          empty="Nothing is waiting for you."
          render={(a) => <ChatApproval key={a.id} approval={a} />}
        />
      );
    default:
      if (name.startsWith("propose") && o.approval) {
        return <ChatApproval approval={o.approval as Approval} />;
      }
      return null;
  }
}

export function ChatToolPart({ part, onNavigate }: { part: Part; onNavigate?: () => void }) {
  const router = useRouter();
  const name = toolNameOf(part);
  const open = (href: string) => {
    onNavigate?.();
    router.push(href);
  };

  if (part.state === "input-streaming" || part.state === "input-available") {
    const label = name.startsWith("propose")
      ? "Preparing a change for you to approve…"
      : RUNNING[name];
    return <Shimmer className="text-muted-foreground text-sm">{label ?? "Working…"}</Shimmer>;
  }

  if (part.state === "output-available") {
    const output = part.output as Record<string, unknown> | null;
    if (output && typeof output.error === "string") {
      return <p className="text-muted-foreground text-sm">{output.error}</p>;
    }
    const cards = output ? cardsFor(name, output, open) : null;
    if (cards) return <div className="min-w-0">{cards}</div>;
  }

  if (part.state === "output-error") {
    return (
      <p className="text-muted-foreground text-sm">That didn&apos;t work. Please try again.</p>
    );
  }

  // Anything without a card shows the kit's generic tool view.
  return (
    <Tool>
      <ToolHeader
        {...(part.type === "dynamic-tool"
          ? { type: part.type, state: part.state, toolName: part.toolName }
          : { type: part.type, state: part.state })}
      />
      <ToolContent>
        <ToolInput input={part.input} />
        {part.state === "output-available" && (
          <ToolOutput output={part.output} errorText={undefined} />
        )}
      </ToolContent>
    </Tool>
  );
}
