import { and, count, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { pushSubscriptions, userSettings } from "@/db/schema";
import { defineAction } from "./define";
import { id } from "./schemas";

// Push notification devices and preferences. Sending lives in lib/push.ts (web-push).

export const pushKind = z.enum(["daily", "replies", "approvals"]);
export type PushKind = z.infer<typeof pushKind>;

export const pushPreferencesSchema = z.object({
  daily: z.boolean(),
  replies: z.boolean(),
  approvals: z.boolean()
});
export type PushPreferences = z.infer<typeof pushPreferencesSchema>;

// What a browser's PushSubscription.toJSON() gives us.
export const browserSubscription = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) })
});

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// A short device name from the user agent, for Settings and the log. Never stored in full.
export function deviceLabel(userAgent: string | null | undefined) {
  const ua = userAgent ?? "";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return "this device";
}

export const pushStatus = defineAction({
  name: "pushStatus",
  description:
    "Push notifications: whether the server can send them, how many devices allowed them, whether a given device (by its push endpoint) is one of them, and which kinds are on.",
  kind: "read",
  input: z.object({ userId: id, endpoint: z.string().max(2000).optional() }),
  output: z.object({
    configured: z.boolean(),
    devices: z.number(),
    thisDevice: z.boolean(),
    preferences: pushPreferencesSchema
  }),
  async handler(input, db) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, input.userId));
    const [mine] = input.endpoint
      ? await db
          .select({ id: pushSubscriptions.id })
          .from(pushSubscriptions)
          .where(
            and(
              eq(pushSubscriptions.userId, input.userId),
              eq(pushSubscriptions.endpoint, input.endpoint)
            )
          )
      : [];
    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, input.userId));
    const { vapidConfig } = await import("@/lib/push-config");
    return {
      configured: vapidConfig() !== null,
      devices: n,
      thisDevice: Boolean(mine),
      preferences: {
        daily: settings?.pushDaily ?? true,
        replies: settings?.pushReplies ?? true,
        approvals: settings?.pushApprovals ?? true
      }
    };
  }
});

export const savePushSubscription = defineAction({
  name: "savePushSubscription",
  description:
    "Remember a device that allowed notifications (its push endpoint and keys). Saving the same endpoint again updates it.",
  kind: "write",
  input: browserSubscription.extend({ userId: id, userAgent: z.string().max(1000).optional() }),
  output: z.object({ device: z.string(), created: z.boolean() }),
  async handler(input, db) {
    const device = deviceLabel(input.userAgent);
    const [existing] = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, input.endpoint));
    const values = {
      userId: input.userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      device
    };
    await db
      .insert(pushSubscriptions)
      .values(values)
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
    return { device, created: !existing };
  },
  // The endpoint and keys are secrets of the device: never in the log.
  log: (input, r) => ({
    entityType: "push_subscription",
    entityId: input.userId,
    summary: r.created
      ? `Turned on notifications on ${r.device}`
      : `Refreshed notifications on ${r.device}`
  })
});

export const removePushSubscription = defineAction({
  name: "removePushSubscription",
  description: "Stop sending notifications to one device, by its push endpoint.",
  kind: "write",
  input: z.object({ userId: id, endpoint: z.string().min(1).max(2000) }),
  output: z.object({ removed: z.number(), device: z.string().nullable() }),
  async handler(input, db) {
    const rows = await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, input.userId),
          eq(pushSubscriptions.endpoint, input.endpoint)
        )
      )
      .returning({ device: pushSubscriptions.device });
    return { removed: rows.length, device: rows[0]?.device ?? null };
  },
  log: (input, r) => ({
    entityType: "push_subscription",
    entityId: input.userId,
    summary: r.removed
      ? `Turned off notifications on ${r.device ?? "a device"}`
      : "Turned off notifications on a device that was already off"
  })
});

export const prunePushSubscriptions = defineAction({
  name: "prunePushSubscriptions",
  description:
    "Forget devices whose push service says the subscription is gone (HTTP 404 or 410): notifications were turned off there, or the app was removed.",
  kind: "write",
  input: z.object({ endpoints: z.array(z.string().min(1)).min(1).max(500) }),
  output: z.object({ removed: z.array(z.string()) }),
  async handler(input, db) {
    const rows = await db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.endpoint, input.endpoints))
      .returning({ device: pushSubscriptions.device });
    return { removed: rows.map((r) => r.device ?? "a device") };
  },
  log: (_input, r) => ({
    entityType: "push_subscription",
    summary: `Removed ${plural(r.removed.length, "device", "devices")} that no longer accept notifications${
      r.removed.length ? ` (${r.removed.join(", ")})` : ""
    }`
  })
});

export const setPushPreferences = defineAction({
  name: "setPushPreferences",
  description:
    "Turn kinds of push notification on or off: the daily summary, Gmail replies, approvals. Applies to every device.",
  kind: "write",
  input: pushPreferencesSchema.partial().extend({ userId: id }),
  output: pushPreferencesSchema,
  async handler(input, db) {
    const set = {
      ...(input.daily !== undefined && { pushDaily: input.daily }),
      ...(input.replies !== undefined && { pushReplies: input.replies }),
      ...(input.approvals !== undefined && { pushApprovals: input.approvals })
    };
    const [row] = Object.keys(set).length
      ? await db
          .insert(userSettings)
          .values({ userId: input.userId, ...set })
          .onConflictDoUpdate({ target: userSettings.userId, set })
          .returning()
      : await db.select().from(userSettings).where(eq(userSettings.userId, input.userId));
    return {
      daily: row?.pushDaily ?? true,
      replies: row?.pushReplies ?? true,
      approvals: row?.pushApprovals ?? true
    };
  },
  log: (input, r) => {
    const names = { daily: "daily summary", replies: "reply", approvals: "approval" } as const;
    const changed = (Object.keys(names) as PushKind[]).filter((k) => input[k] !== undefined);
    return {
      entityType: "user_settings",
      entityId: input.userId,
      summary: changed.length
        ? changed.map((k) => `Turned ${r[k] ? "on" : "off"} ${names[k]} notifications`).join("; ")
        : "Notification settings unchanged"
    };
  }
});
