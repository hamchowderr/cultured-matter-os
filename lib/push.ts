import { and, eq, isNull, or, type SQL } from "drizzle-orm";
import webpush from "web-push";

import { listNotifications } from "@/actions/notifications";
import { firstUser, taskHref } from "@/actions/preferences";
import { prunePushSubscriptions, type PushKind } from "@/actions/push";
import type { Database } from "@/db";
import { pushSubscriptions, userSettings } from "@/db/schema";
import { vapidConfig } from "@/lib/push-config";

// Sends web push notifications with the web-push library (VAPID + payload encryption).
//
// iOS rules this follows: every push shows a notification (the service worker always calls
// showNotification), and the payload carries the icon badge count, which the service worker sets
// with navigator.setAppBadge. The count is the header bell's unread count (listNotifications).

export type PushMessage = {
  title: string;
  body: string;
  // Same-origin path the notification opens.
  url: string;
  // Same tag replaces an earlier notification instead of stacking.
  tag?: string;
};

// What the service worker receives (public/sw.js reads these fields).
export type PushPayload = PushMessage & { badge: number };

export type PushResult = { sent: number; failed: number; removed: number; skipped?: string };

const HOUR = 3600;
const OPTIONS: Record<
  PushKind | "test",
  { TTL: number; urgency: "normal" | "high"; topic?: string }
> = {
  // A morning summary is stale by evening; a newer one replaces one still waiting.
  daily: { TTL: 12 * HOUR, urgency: "normal", topic: "daily-summary" },
  replies: { TTL: 24 * HOUR, urgency: "high" },
  approvals: { TTL: 24 * HOUR, urgency: "high" },
  test: { TTL: HOUR, urgency: "high" }
};

const PREFERENCE = {
  daily: userSettings.pushDaily,
  replies: userSettings.pushReplies,
  approvals: userSettings.pushApprovals
} as const;

// Push services answer 404 or 410 when a subscription no longer exists.
const isGone = (e: unknown) =>
  typeof e === "object" &&
  e !== null &&
  "statusCode" in e &&
  ((e as { statusCode: number }).statusCode === 404 ||
    (e as { statusCode: number }).statusCode === 410);

export async function sendPush(
  db: Database,
  kind: PushKind | "test",
  message: PushMessage,
  // Narrow to one person or one device (the Settings test button); default is everyone who has
  // this kind turned on.
  only: { userId?: string; endpoint?: string } = {}
): Promise<PushResult> {
  const vapid = vapidConfig();
  if (!vapid) return { sent: 0, failed: 0, removed: 0, skipped: "Push is not configured" };

  const filters: (SQL | undefined)[] = [
    only.userId ? eq(pushSubscriptions.userId, only.userId) : undefined,
    only.endpoint ? eq(pushSubscriptions.endpoint, only.endpoint) : undefined
  ];
  // No settings row yet means every kind is on.
  if (kind !== "test") filters.push(or(isNull(PREFERENCE[kind]), eq(PREFERENCE[kind], true)));
  const subs = await db
    .select({
      userId: pushSubscriptions.userId,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      device: pushSubscriptions.device
    })
    .from(pushSubscriptions)
    .leftJoin(userSettings, eq(userSettings.userId, pushSubscriptions.userId))
    .where(and(...filters));
  if (subs.length === 0) return { sent: 0, failed: 0, removed: 0, skipped: "No devices" };

  const subject = vapid.subject ?? `mailto:${(await firstUser(db))?.email ?? "owner@localhost"}`;
  const ctx = { db };
  const badges = new Map<string, number>();
  for (const userId of new Set(subs.map((s) => s.userId))) {
    badges.set(userId, (await listNotifications.run({ userId }, ctx)).unread);
  }

  const gone: string[] = [];
  let sent = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (s) => {
      const payload: PushPayload = { ...message, badge: badges.get(s.userId) ?? 0 };
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          {
            ...OPTIONS[kind],
            vapidDetails: { subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey }
          }
        );
        sent++;
      } catch (e) {
        if (isGone(e)) return void gone.push(s.endpoint);
        failed++;
        const status = (e as { statusCode?: number }).statusCode;
        console.error(
          `Push to ${s.device ?? "a device"} failed${status ? ` (HTTP ${status})` : ""}:`,
          e instanceof Error ? e.message : e
        );
      }
    })
  );

  if (gone.length) await prunePushSubscriptions.run({ endpoints: gone }, ctx);
  return { sent, failed, removed: gone.length };
}

// ---------------------------------------------------------------- Messages

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function approvalPush(approval: { id: string; summary: string }): PushMessage {
  return {
    title: "Waiting for your approval",
    body: clip(approval.summary, 180),
    url: "/today#approvals",
    tag: `approval-${approval.id}`
  };
}

export function replyPush(replied: { title: string; projectId: string | null }[]): PushMessage {
  const one = replied.length === 1 ? replied[0] : null;
  return {
    title: one ? "Reply arrived" : `${replied.length} replies arrived`,
    body: clip(replied.map((t) => t.title).join(", "), 180),
    url: taskHref(one?.projectId ?? null),
    tag: "replies"
  };
}
