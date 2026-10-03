import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  max,
  ne,
  or
} from "drizzle-orm";
import { z } from "zod/v4";

import { approvals, captures, companies, grants, notificationReads, tasks } from "@/db/schema";
import { defineAction } from "./define";

const DAY = 86_400_000;
// Replies stay in the bell this long after the task moved to "replied".
export const REPLY_WINDOW_DAYS = 14;
// Grants show once their deadline is this close.
export const GRANT_WINDOW_DAYS = 7;
// Read marks older than this are dropped; the items they covered are long gone.
const READ_KEEP_DAYS = 90;

export const notificationKind = z.enum(["approval", "reply", "grant", "radar", "inbox"]);

export const notificationSchema = z.object({
  // Stable while the thing it points at is unchanged; read state is stored against it.
  id: z.string(),
  kind: notificationKind,
  title: z.string(),
  description: z.string(),
  href: z.string(),
  at: z.date(),
  read: z.boolean()
});

export type NotificationItem = z.infer<typeof notificationSchema>;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function shortDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

export const listNotifications = defineAction({
  name: "listNotifications",
  description:
    "Items for the header bell: open approvals, Gmail replies on waiting tasks (last 14 days), grants closing within 7 days, new radar finds since the last Radar visit, and inbox captures still to sort. Newest first, each with its read state.",
  kind: "read",
  input: z.object({
    userId: z.string().min(1),
    // Radar baseline (the radar visit cookie). Before her first visit, the last week counts as new.
    radarSince: z.coerce.date().optional(),
    now: z.coerce.date().optional()
  }),
  output: z.object({ items: z.array(notificationSchema), unread: z.number() }),
  async handler(input, db) {
    const now = input.now ?? new Date();
    const radarSince = input.radarSince ?? new Date(now.getTime() - 7 * DAY);

    const [openApprovals, replied, closing, radar, inbox] = await Promise.all([
      db
        .select({ id: approvals.id, summary: approvals.summary, createdAt: approvals.createdAt })
        .from(approvals)
        .where(eq(approvals.status, "pending"))
        .orderBy(desc(approvals.createdAt)),
      db
        .select({
          id: tasks.id,
          title: tasks.title,
          projectId: tasks.projectId,
          updatedAt: tasks.updatedAt
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.status, "replied"),
            // Only tasks whose Gmail thread the reply check watches.
            isNotNull(tasks.emailThreadId),
            gte(tasks.updatedAt, new Date(now.getTime() - REPLY_WINDOW_DAYS * DAY))
          )
        )
        .orderBy(desc(tasks.updatedAt)),
      db
        .select({
          id: grants.id,
          title: grants.title,
          agency: grants.agency,
          deadline: grants.deadline
        })
        .from(grants)
        .where(
          and(
            gte(grants.deadline, now),
            lte(grants.deadline, new Date(now.getTime() + GRANT_WINDOW_DAYS * DAY)),
            or(isNull(grants.status), ne(grants.status, "passed")),
            // The ones she can apply for, plus any she has put on the board herself.
            or(eq(grants.forProfitEligible, true), isNotNull(grants.status))
          )
        )
        .orderBy(grants.deadline),
      db
        .select({ n: count(), latest: max(companies.firstSeenAt) })
        .from(companies)
        .where(and(eq(companies.status, "new"), gt(companies.firstSeenAt, radarSince))),
      db
        .select({ n: count(), latest: max(captures.createdAt) })
        .from(captures)
        .where(isNull(captures.filedAt))
    ]);

    const items: Omit<NotificationItem, "read">[] = [];

    for (const a of openApprovals) {
      items.push({
        id: `approval:${a.id}`,
        kind: "approval",
        title: "Waiting for your approval",
        description: a.summary,
        href: "/today#approvals",
        at: a.createdAt
      });
    }

    for (const t of replied) {
      items.push({
        id: `reply:${t.id}`,
        kind: "reply",
        title: "Reply arrived",
        description: t.title,
        href: t.projectId
          ? `/projects?p=${encodeURIComponent(t.projectId)}`
          : "/projects?view=tasks",
        at: t.updatedAt
      });
    }

    for (const g of closing) {
      items.push({
        id: `grant:${g.id}:${g.deadline!.getTime()}`,
        kind: "grant",
        title: `Grant closes ${shortDate(g.deadline!)}`,
        description: g.agency ? `${g.title} (${g.agency})` : g.title,
        href: "/grants",
        // Sorted with the rest by when it needs her: a week before the deadline.
        at: new Date(Math.min(now.getTime(), g.deadline!.getTime() - GRANT_WINDOW_DAYS * DAY))
      });
    }

    const radarCount = radar[0]?.n ?? 0;
    const radarLatest = radar[0]?.latest;
    if (radarCount > 0 && radarLatest) {
      items.push({
        // Changes when more finds arrive or the baseline moves, so a new batch shows as unread.
        id: `radar:${radarSince.getTime()}:${radarLatest.getTime()}`,
        kind: "radar",
        title: "New on Radar",
        description: `${plural(radarCount, "new company", "new companies")} since your last visit`,
        href: "/radar?new=1",
        at: radarLatest
      });
    }

    const inboxCount = inbox[0]?.n ?? 0;
    const inboxLatest = inbox[0]?.latest;
    if (inboxCount > 0 && inboxLatest) {
      items.push({
        id: `inbox:${inboxLatest.getTime()}`,
        kind: "inbox",
        title: "Inbox to sort",
        description: `${plural(inboxCount, "capture", "captures")} still to sort`,
        href: "/inbox",
        at: inboxLatest
      });
    }

    items.sort((a, b) => b.at.getTime() - a.at.getTime());

    const ids = items.map((i) => i.id);
    const readRows = ids.length
      ? await db
          .select({ itemId: notificationReads.itemId })
          .from(notificationReads)
          .where(
            and(eq(notificationReads.userId, input.userId), inArray(notificationReads.itemId, ids))
          )
      : [];
    const readIds = new Set(readRows.map((r) => r.itemId));

    const withRead = items.map((i) => ({ ...i, read: readIds.has(i.id) }));
    return { items: withRead, unread: withRead.filter((i) => !i.read).length };
  }
});

export const markNotificationsRead = defineAction({
  name: "markNotificationsRead",
  description: "Mark header notifications as read, by the ids listNotifications gave them.",
  kind: "write",
  input: z.object({
    userId: z.string().min(1),
    itemIds: z.array(z.string().min(1)).min(1).max(500)
  }),
  output: z.object({ marked: z.number() }),
  async handler(input, db) {
    const now = new Date();
    await db
      .insert(notificationReads)
      .values(
        [...new Set(input.itemIds)].map((itemId) => ({ userId: input.userId, itemId, readAt: now }))
      )
      .onConflictDoNothing();
    await db
      .delete(notificationReads)
      .where(lt(notificationReads.readAt, new Date(now.getTime() - READ_KEEP_DAYS * DAY)));
    return { marked: new Set(input.itemIds).size };
  },
  log: (_input, r) => ({
    entityType: "notification",
    summary: `Marked ${plural(r.marked, "notification", "notifications")} as read`
  })
});
