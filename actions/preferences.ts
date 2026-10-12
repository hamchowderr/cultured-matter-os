import { randomBytes } from "node:crypto";

import { and, asc, eq, gt, gte, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod/v4";

import type { Database, Executor } from "@/db";
import { grants, projects, tasks, userSettings, users } from "@/db/schema";
import {
  isPersonal,
  PERSONAL_BUSINESS,
  SUGGESTED_PERSONAL_PROJECTS,
  WORK_SCOPES
} from "@/lib/personal";
import { ownerEmail } from "@/lib/allowed-emails";
import { personalSql } from "@/lib/personal-sql";
import { HOME_TIME_ZONE, startOfDayIn } from "@/lib/time";
import { addSeen, getTour, parseSeen, TOURS, type TourId } from "@/lib/tours";
import { defineAction } from "./define";
import { listNotifications, type NotificationItem } from "./notifications";
import { id } from "./schemas";

const DAY = 86_400_000;
// For-profit grants she hasn't put on the board show in the calendar once this close.
export const CALENDAR_GRANT_WINDOW_DAYS = 60;

const settingsSchema = z.object({
  calendarToken: z.string().nullable(),
  dailyEmail: z.boolean(),
  lastSummaryAt: z.date().nullable(),
  toursSeen: z.array(z.string()),
  workScope: z.enum(WORK_SCOPES)
});

async function settingsRow(db: Executor, userId: string) {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  return row ?? null;
}

// A 192-bit random token, URL safe. Long enough that guessing a feed URL is not a concern.
export const newCalendarToken = () => randomBytes(24).toString("base64url");

export const getUserSettings = defineAction({
  name: "getUserSettings",
  description:
    "Her preferences: the private calendar feed token, whether the daily email is on, the tours she has seen, and the Business / Personal / All switch.",
  kind: "read",
  input: z.object({ userId: id }),
  output: settingsSchema,
  async handler(input, db) {
    const row = await settingsRow(db, input.userId);
    return {
      calendarToken: row?.calendarToken ?? null,
      dailyEmail: row?.dailyEmail ?? false,
      lastSummaryAt: row?.lastSummaryAt ?? null,
      toursSeen: parseSeen(row?.toursSeen),
      workScope: row?.workScope ?? "all"
    };
  }
});

export const setWorkScope = defineAction({
  name: "setWorkScope",
  description:
    "Set the Business / Personal / All switch on Today and Projects. The first switch to Personal adds suggested personal projects when she has none.",
  kind: "write",
  input: z.object({ userId: id, scope: z.enum(WORK_SCOPES) }),
  output: z.object({
    workScope: z.enum(WORK_SCOPES),
    // Names of suggested personal projects this switch added (empty almost always).
    added: z.array(z.string())
  }),
  async handler(input, db) {
    const row = await settingsRow(db, input.userId);
    let added: string[] = [];
    if (input.scope === "personal" && !row?.personalSeeded) {
      const [mine] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(personalSql(projects.business))
        .limit(1);
      if (!mine) {
        await db
          .insert(projects)
          .values(SUGGESTED_PERSONAL_PROJECTS.map((p) => ({ ...p, business: PERSONAL_BUSINESS })));
        added = SUGGESTED_PERSONAL_PROJECTS.map((p) => p.name);
      }
    }
    const personalSeeded = Boolean(row?.personalSeeded) || input.scope === "personal";
    await db
      .insert(userSettings)
      .values({ userId: input.userId, workScope: input.scope, personalSeeded })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { workScope: input.scope, personalSeeded }
      });
    return { workScope: input.scope, added };
  },
  log: (input, r) => ({
    entityType: "user_settings",
    entityId: input.userId,
    summary:
      `Switched to ${r.workScope === "all" ? "business and personal" : r.workScope} work` +
      (r.added.length ? `, and added ${r.added.length} suggested personal projects` : ""),
    data: r.added.length ? { added: r.added } : undefined
  })
});

export const resetCalendarLink = defineAction({
  name: "resetCalendarLink",
  description:
    "Create the private calendar feed link, or replace it with a new one. The old link stops working.",
  kind: "write",
  input: z.object({ userId: id }),
  output: z.object({ calendarToken: z.string(), replaced: z.boolean() }),
  async handler(input, db) {
    const previous = await settingsRow(db, input.userId);
    const calendarToken = newCalendarToken();
    await db
      .insert(userSettings)
      .values({ userId: input.userId, calendarToken })
      .onConflictDoUpdate({ target: userSettings.userId, set: { calendarToken } });
    return { calendarToken, replaced: Boolean(previous?.calendarToken) };
  },
  // The token is a secret: never in the log.
  log: (input, r) => ({
    entityType: "user_settings",
    entityId: input.userId,
    summary: r.replaced ? "Reset the calendar feed link" : "Created the calendar feed link"
  })
});

export const setDailyEmail = defineAction({
  name: "setDailyEmail",
  description: "Turn the daily summary email on or off.",
  kind: "write",
  input: z.object({ userId: id, enabled: z.boolean() }),
  output: z.object({ dailyEmail: z.boolean() }),
  async handler(input, db) {
    await db
      .insert(userSettings)
      .values({ userId: input.userId, dailyEmail: input.enabled })
      .onConflictDoUpdate({ target: userSettings.userId, set: { dailyEmail: input.enabled } });
    return { dailyEmail: input.enabled };
  },
  log: (input, r) => ({
    entityType: "user_settings",
    entityId: input.userId,
    summary: r.dailyEmail ? "Turned the daily email on" : "Turned the daily email off"
  })
});

const tourIds = TOURS.map((t) => t.id) as [TourId, ...TourId[]];

export const markTourSeen = defineAction({
  name: "markTourSeen",
  description:
    "Remember that she finished or skipped a guided tour. The welcome tour stops starting on its own once it is seen.",
  kind: "write",
  input: z.object({ userId: id, tourId: z.enum(tourIds), finished: z.boolean() }),
  output: z.object({ toursSeen: z.array(z.string()) }),
  async handler(input, db) {
    const row = await settingsRow(db, input.userId);
    const toursSeen = addSeen(parseSeen(row?.toursSeen), input.tourId);
    await db
      .insert(userSettings)
      .values({ userId: input.userId, toursSeen })
      .onConflictDoUpdate({ target: userSettings.userId, set: { toursSeen } });
    return { toursSeen };
  },
  log: (input) => ({
    entityType: "user_settings",
    entityId: input.userId,
    summary: `${input.finished ? "Finished" : "Skipped"} the ${getTour(input.tourId)?.label ?? input.tourId} tour`
  })
});

// ---------------------------------------------------------------- Calendar feed

export const calendarEventSchema = z.object({
  // Stable across refreshes, so Apple Calendar updates an event instead of adding a copy.
  uid: z.string(),
  kind: z.enum(["grant", "task"]),
  title: z.string(),
  description: z.string(),
  // The day it falls on in her time zone (all-day event).
  date: z.date(),
  href: z.string()
});
export type CalendarEvent = z.infer<typeof calendarEventSchema>;

export const calendarFeed = defineAction({
  name: "calendarFeed",
  description:
    "Events for the private calendar feed: deadlines of grants on the board, for-profit grants closing within 60 days, and due dates of open tasks, business and personal (personal ones labeled). Null when the token matches no one.",
  kind: "read",
  input: z.object({ token: z.string().min(1).max(200), now: z.coerce.date().optional() }),
  output: z.object({ events: z.array(calendarEventSchema) }).nullable(),
  async handler(input, db) {
    const [owner] = await db
      .select({ userId: userSettings.userId })
      .from(userSettings)
      .where(eq(userSettings.calendarToken, input.token));
    if (!owner) return null;

    const now = input.now ?? new Date();
    const today = startOfDayIn(HOME_TIME_ZONE, now);
    const [grantRows, taskRows] = await Promise.all([
      db
        .select({
          id: grants.id,
          title: grants.title,
          agency: grants.agency,
          deadline: grants.deadline,
          status: grants.status,
          forProfitEligible: grants.forProfitEligible,
          url: grants.url
        })
        .from(grants)
        .where(
          and(
            // Passed (closed) deadlines and rolling grants have no date to show.
            gte(grants.deadline, today),
            or(isNull(grants.status), ne(grants.status, "passed")),
            or(
              // On her board, however far out.
              isNotNull(grants.status),
              // Or one she can apply for, once it is within the window.
              and(
                eq(grants.forProfitEligible, true),
                lte(grants.deadline, new Date(now.getTime() + CALENDAR_GRANT_WINDOW_DAYS * DAY))
              )
            )
          )
        )
        .orderBy(asc(grants.deadline))
        .limit(500),
      db
        .select({
          id: tasks.id,
          title: tasks.title,
          dueDate: tasks.dueDate,
          projectId: tasks.projectId,
          projectName: projects.name,
          business: projects.business
        })
        .from(tasks)
        .leftJoin(projects, eq(tasks.projectId, projects.id))
        .where(and(ne(tasks.status, "done"), isNotNull(tasks.dueDate)))
        .orderBy(asc(tasks.dueDate))
        .limit(500)
    ]);

    const events: CalendarEvent[] = [];
    for (const g of grantRows) {
      const lines = [g.agency, g.status ? `On your board: ${g.status}` : null, g.url].filter(
        Boolean
      );
      events.push({
        uid: `grant-${g.id}@cultured-matter-os`,
        kind: "grant",
        title: `Grant deadline: ${g.title}`,
        description: lines.join("\n"),
        date: g.deadline!,
        href: grantHref(g.title, g.forProfitEligible)
      });
    }
    for (const t of taskRows) {
      const personal = isPersonal(t.business);
      events.push({
        uid: `task-${t.id}@cultured-matter-os`,
        kind: "task",
        // Personal tasks are labeled so they read apart from work in the same calendar.
        title: personal ? `Due (personal): ${t.title}` : `Due: ${t.title}`,
        description: t.projectName
          ? `${personal ? "Personal project" : "Project"}: ${t.projectName}`
          : "",
        date: t.dueDate!,
        href: taskHref(t.projectId)
      });
    }
    return { events };
  }
});

// Links back into the app. Grants have no page of their own: the search narrows the board to it.
export function grantHref(title: string, forProfitEligible: boolean) {
  const qs = new URLSearchParams({ q: title });
  if (!forProfitEligible) qs.set("all", "1");
  return `/grants?${qs}`;
}
export const taskHref = (projectId: string | null) =>
  projectId ? `/projects?p=${encodeURIComponent(projectId)}` : "/projects?view=tasks";

// ---------------------------------------------------------------- Daily summary

// The person the app belongs to: the owner (OWNER_EMAIL), or without it the first account
// created (single-user app).
export async function firstUser(db: Executor) {
  const owner = ownerEmail();
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(owner ? eq(sql`lower(${users.email})`, owner) : undefined)
    .orderBy(asc(users.createdAt))
    .limit(1);
  return row ?? null;
}

const newGrantSchema = z.object({
  id: z.string(),
  title: z.string(),
  agency: z.string().nullable(),
  deadline: z.date().nullable(),
  href: z.string()
});

export const summaryItemSchema = z.object({
  title: z.string(),
  detail: z.string().nullable(),
  href: z.string()
});
export type SummaryItem = z.infer<typeof summaryItemSchema>;

export const dailySummarySchema = z.object({
  since: z.date(),
  newGrants: z.array(summaryItemSchema),
  // All new grants; the list above stops at ten.
  newGrantsTotal: z.number(),
  closingGrants: z.array(summaryItemSchema),
  radar: summaryItemSchema.nullable(),
  replies: z.array(summaryItemSchema),
  approvals: z.array(summaryItemSchema),
  // Something arrived since the last summary. When false, no email goes out.
  hasNews: z.boolean()
});
export type DailySummary = z.infer<typeof dailySummarySchema>;

export const newGrantsSince = defineAction({
  name: "newGrantsSince",
  description:
    "Grants first seen after a moment that she could act on: for-profit eligible or on her board, not passed, deadline still ahead or rolling.",
  kind: "read",
  input: z.object({ since: z.coerce.date(), now: z.coerce.date().optional() }),
  output: z.object({ grants: z.array(newGrantSchema) }),
  async handler(input, db) {
    const now = input.now ?? new Date();
    const rows = await db
      .select({
        id: grants.id,
        title: grants.title,
        agency: grants.agency,
        deadline: grants.deadline,
        forProfitEligible: grants.forProfitEligible
      })
      .from(grants)
      .where(
        and(
          gt(grants.firstSeenAt, input.since),
          or(eq(grants.forProfitEligible, true), isNotNull(grants.status)),
          or(isNull(grants.status), ne(grants.status, "passed")),
          or(isNull(grants.deadline), gte(grants.deadline, startOfDayIn(HOME_TIME_ZONE, now)))
        )
      )
      // Soonest deadline first; rolling grants last.
      .orderBy(sql`${grants.deadline} is null`, asc(grants.deadline))
      .limit(200);
    return {
      grants: rows.map((g) => ({
        id: g.id,
        title: g.title,
        agency: g.agency,
        deadline: g.deadline,
        href: grantHref(g.title, g.forProfitEligible)
      }))
    };
  }
});

const DAILY_LIST_MAX = 10;

export const dailySummary = defineAction({
  name: "dailySummary",
  description:
    "What the daily email would say: grants first seen since the last summary, grants closing within 7 days, new radar finds, Gmail replies on waiting tasks, and open approvals. hasNews is false when nothing arrived since then.",
  kind: "read",
  input: z.object({
    userId: id,
    // Defaults to the last summary sent, or a day ago before the first one.
    since: z.coerce.date().optional(),
    now: z.coerce.date().optional()
  }),
  output: dailySummarySchema,
  async handler(input, db) {
    const now = input.now ?? new Date();
    const ctx = { db: db as Database };
    const settings = await settingsRow(db, input.userId);
    const since = input.since ?? settings?.lastSummaryAt ?? new Date(now.getTime() - DAY);

    // The same queries as the header bell, with the radar baseline at the last summary.
    const [{ items }, { grants: fresh }] = await Promise.all([
      listNotifications.run({ userId: input.userId, radarSince: since, now }, ctx),
      newGrantsSince.run({ since, now }, ctx)
    ]);
    const of = (kind: NotificationItem["kind"]) => items.filter((i) => i.kind === kind);
    const toItem = (i: NotificationItem): SummaryItem => ({
      title: i.title,
      detail: i.description,
      href: i.href
    });
    const isNew = (i: NotificationItem) => i.at.getTime() > since.getTime();

    // Soonest deadline first (each one's time is its deadline less 7 days).
    const closing = of("grant").sort((a, b) => a.at.getTime() - b.at.getTime());
    const radar = of("radar")[0] ?? null;
    const replies = of("reply").filter(isNew);
    const approvals = of("approval");

    const hasNews =
      fresh.length > 0 ||
      radar !== null ||
      replies.length > 0 ||
      // A grant counts as news on the day it comes within the 7-day window.
      closing.some(isNew) ||
      approvals.some(isNew);

    return {
      since,
      newGrants: fresh.slice(0, DAILY_LIST_MAX).map((g) => ({
        title: g.title,
        detail:
          [g.agency, g.deadline ? `closes ${shortDate(g.deadline)}` : "rolling"]
            .filter(Boolean)
            .join(", ") || null,
        href: g.href
      })),
      newGrantsTotal: fresh.length,
      closingGrants: closing.map((g) => ({
        // listNotifications says "Grant closes Oct 9"; the email lists the grant first.
        title: g.description,
        detail: g.title.replace(/^Grant closes/, "Closes"),
        href: "/grants?soon=1"
      })),
      radar: radar ? toItem(radar) : null,
      replies: replies.map(toItem),
      approvals: approvals.map(toItem),
      hasNews
    };
  }
});

function shortDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: HOME_TIME_ZONE
  }).format(d);
}

export const recordDailySummary = defineAction({
  name: "recordDailySummary",
  description:
    "Record the outcome of the daily summary email. A sent summary moves the 'new since' mark forward; a skipped one only logs why.",
  kind: "write",
  input: z.object({
    userId: id,
    at: z.coerce.date(),
    outcome: z.enum(["sent", "skipped"]),
    via: z.enum(["gmail", "resend", "push"]).optional(),
    reason: z.string().max(300).optional(),
    items: z.number().int().min(0).default(0),
    // Devices the push version reached, when one was sent.
    pushed: z.number().int().min(0).optional()
  }),
  output: z.object({ outcome: z.enum(["sent", "skipped"]) }),
  async handler(input, db) {
    if (input.outcome === "sent") {
      await db
        .insert(userSettings)
        .values({ userId: input.userId, lastSummaryAt: input.at })
        .onConflictDoUpdate({ target: userSettings.userId, set: { lastSummaryAt: input.at } });
    }
    return { outcome: input.outcome };
  },
  log: (input) => {
    const devices =
      input.pushed !== undefined
        ? `push to ${input.pushed} device${input.pushed === 1 ? "" : "s"}`
        : null;
    const channel =
      input.via === "push"
        ? devices
        : [input.via === "resend" ? "Resend" : "Gmail", devices].filter(Boolean).join(" and ");
    return {
      entityType: "daily_summary",
      entityId: input.userId,
      summary:
        input.outcome === "sent"
          ? `Sent the daily summary (${input.items} item${input.items === 1 ? "" : "s"}) via ${channel}`
          : `Skipped the daily summary: ${input.reason ?? "no reason given"}${
              input.via !== "push" && devices ? ` (sent the ${devices})` : ""
            }`,
      data: {
        via: input.via ?? null,
        reason: input.reason ?? null,
        items: input.items,
        pushed: input.pushed ?? null
      }
    };
  }
});
