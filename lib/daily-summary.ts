import { ActionError } from "@/actions/define";
import {
  type DailySummary,
  dailySummary,
  firstUser,
  getUserSettings,
  recordDailySummary,
  type SummaryItem
} from "@/actions/preferences";
import { pushStatus } from "@/actions/push";
import type { Database } from "@/db";
import type { PushMessage, PushResult } from "@/lib/push";
import { HOME_TIME_ZONE } from "@/lib/time";

// The morning summary email behind /api/cron/daily-summary. Sent from her own Gmail to herself
// (users.messages.send under the gmail.compose permission she already granted). Resend is only a
// fallback for the owner's testing, chosen with EMAIL_TRANSPORT=resend.

export type SummaryEmail = { subject: string; text: string; html: string };
export type OutgoingEmail = SummaryEmail & { to: string; toName?: string };
export type Transport = { via: "gmail" | "resend"; send: (email: OutgoingEmail) => Promise<void> };

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Section = { heading: string; items: SummaryItem[]; more?: number };

function sections(s: DailySummary): Section[] {
  const out: Section[] = [];
  if (s.newGrants.length) {
    out.push({
      heading: `New grants (${s.newGrantsTotal})`,
      items: s.newGrants,
      more: s.newGrantsTotal - s.newGrants.length
    });
  }
  if (s.closingGrants.length)
    out.push({ heading: "Grants closing within 7 days", items: s.closingGrants });
  if (s.radar) out.push({ heading: "New on Radar", items: [s.radar] });
  if (s.replies.length) out.push({ heading: "Replies to your emails", items: s.replies });
  if (s.approvals.length) out.push({ heading: "Waiting for your approval", items: s.approvals });
  return out;
}

export function composeSummaryEmail(s: DailySummary, baseUrl: string, now: Date): SummaryEmail {
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: HOME_TIME_ZONE
  }).format(now);
  const link = (href: string) => new URL(href, baseUrl).toString();
  const parts = sections(s);
  const subject = `Your day in Cultured Matter: ${day}`;

  const text = [
    `Good morning. Here is what is new since your last summary.`,
    "",
    ...parts.flatMap((p) => [
      p.heading.toUpperCase(),
      ...p.items.map((i) => `- ${i.title}${i.detail ? ` (${i.detail})` : ""}\n  ${link(i.href)}`),
      ...(p.more ? [`- and ${p.more} more: ${link("/grants")}`] : []),
      ""
    ]),
    `Open Cultured Matter: ${link("/today")}`,
    `Turn this email off in Settings: ${link("/settings")}`
  ].join("\n");

  const li = (i: SummaryItem) =>
    `<li style="margin:0 0 8px"><a href="${escapeHtml(link(i.href))}" style="color:#1d4ed8">${escapeHtml(i.title)}</a>${
      i.detail ? `<br><span style="color:#6b7280">${escapeHtml(i.detail)}</span>` : ""
    }</li>`;
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.5;color:#111827">
<div style="max-width:560px;margin:0 auto">
<p style="margin:0 0 16px">Good morning. Here is what is new since your last summary.</p>
${parts
  .map(
    (p) => `<h2 style="font-size:16px;margin:24px 0 8px">${escapeHtml(p.heading)}</h2>
<ul style="margin:0;padding-left:20px">${p.items.map(li).join("")}${
      p.more
        ? `<li style="margin:0 0 8px"><a href="${escapeHtml(link("/grants"))}" style="color:#1d4ed8">and ${p.more} more</a></li>`
        : ""
    }</ul>`
  )
  .join("\n")}
<p style="margin:32px 0 0"><a href="${escapeHtml(link("/today"))}" style="color:#1d4ed8">Open Cultured Matter</a></p>
<p style="margin:8px 0 0;color:#6b7280;font-size:13px">Turn this email off in <a href="${escapeHtml(link("/settings"))}" style="color:#6b7280">Settings</a>.</p>
</div></body></html>`;

  return { subject, text, html };
}

// Her own Gmail, to herself.
export function gmailTransport(db: Database): Transport {
  return {
    via: "gmail",
    async send(email) {
      const { googleSession, gmail, rawMessage } = await import("@/lib/google");
      const session = await googleSession(db);
      await gmail(session, "/messages/send", {
        method: "POST",
        body: {
          raw: rawMessage({
            to: email.to,
            toName: email.toName,
            subject: email.subject,
            body: email.text,
            html: email.html
          })
        }
      });
    }
  };
}

// Owner testing only (EMAIL_TRANSPORT=resend). From EMAIL_FROM on a domain verified in Resend.
export function resendTransport(): Transport {
  return {
    via: "resend",
    async send(email) {
      const key = process.env.RESEND_API_KEY;
      const from = process.env.EMAIL_FROM;
      if (!key || !from)
        throw new ActionError("unavailable", "RESEND_API_KEY or EMAIL_FROM is not set");
      const { Resend } = await import("resend");
      const { error } = await new Resend(key).emails.send({
        from,
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html
      });
      if (error) throw new ActionError("unavailable", `Resend refused the email: ${error.message}`);
    }
  };
}

export function pickTransport(db: Database): Transport {
  return process.env.EMAIL_TRANSPORT === "resend" ? resendTransport() : gmailTransport(db);
}

// The push version of the summary: one line of counts, opening Today.
export function composeSummaryPush(s: DailySummary): PushMessage {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const parts = [
    s.newGrantsTotal ? n(s.newGrantsTotal, "new grant", "new grants") : null,
    s.closingGrants.length
      ? `${n(s.closingGrants.length, "grant", "grants")} closing this week`
      : null,
    s.radar ? (s.radar.detail ?? "New on Radar") : null,
    s.replies.length ? n(s.replies.length, "reply", "replies") : null,
    s.approvals.length ? `${n(s.approvals.length, "approval", "approvals")} waiting` : null
  ].filter(Boolean);
  return {
    title: "Your day in Cultured Matter",
    body: parts.join(" · ") || "Here is what is new today.",
    url: "/today",
    tag: "daily-summary"
  };
}

export type DailySummaryResult = (
  | { ok: true; sent: true; via: Transport["via"] | "push"; items: number }
  | { ok: true; sent: false; skipped: string }
  | { ok: false; sent: false; error: string }
) & {
  // Devices the push reached; present only when a push was attempted.
  pushed?: number;
};

export type DailyPush = (db: Database, message: PushMessage, userId: string) => Promise<PushResult>;
const defaultPush: DailyPush = async (db, message, userId) =>
  (await import("@/lib/push")).sendPush(db, "daily", message, { userId });

// One morning job for both channels: the email (when on) and the push (when on and a device
// allowed it). Both say the same "what's new" and share the "new since" mark.
export async function runDailySummary(
  opts: {
    db?: Database;
    now?: Date;
    transport?: Transport;
    baseUrl?: string;
    push?: DailyPush;
  } = {}
): Promise<DailySummaryResult> {
  const db = opts.db ?? (await import("@/db")).db;
  const ctx = { db };
  const now = opts.now ?? new Date();
  const baseUrl = opts.baseUrl ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const push = opts.push ?? defaultPush;

  const user = await firstUser(db);
  if (!user) return { ok: true, sent: false, skipped: "No one has signed in yet" };
  const settings = await getUserSettings.run({ userId: user.id }, ctx);
  const devices = await pushStatus.run({ userId: user.id }, ctx);
  const pushOn = devices.configured && devices.preferences.daily && devices.devices > 0;
  if (!settings.dailyEmail && !pushOn) {
    return { ok: true, sent: false, skipped: "Daily email is off" };
  }

  const summary = await dailySummary.run({ userId: user.id, now }, ctx);
  // Nothing new: no email, no push, and nothing logged (so the log doesn't fill with empty days).
  if (!summary.hasNews) return { ok: true, sent: false, skipped: "Nothing new" };

  const items =
    summary.newGrantsTotal +
    summary.closingGrants.length +
    (summary.radar ? 1 : 0) +
    summary.replies.length +
    summary.approvals.length;

  // The push first: it does not depend on Google.
  let pushed: number | undefined;
  if (pushOn) {
    try {
      pushed = (await push(db, composeSummaryPush(summary), user.id)).sent;
    } catch (e) {
      console.error(e);
      pushed = 0;
    }
  }
  const withPush = (r: DailySummaryResult): DailySummaryResult =>
    pushed === undefined ? r : { ...r, pushed };

  if (!settings.dailyEmail) {
    // Push only. A delivered push moves the "new since" mark like a sent email does.
    await recordDailySummary.run(
      pushed
        ? { userId: user.id, at: now, outcome: "sent", via: "push", items, pushed }
        : {
            userId: user.id,
            at: now,
            outcome: "skipped",
            via: "push",
            reason: "no device accepted the push",
            items,
            pushed
          },
      ctx
    );
    return pushed
      ? withPush({ ok: true, sent: true, via: "push", items })
      : withPush({ ok: false, sent: false, error: "No device accepted the push" });
  }

  const transport = opts.transport ?? pickTransport(db);
  try {
    await transport.send({
      to: user.email,
      toName: user.name,
      ...composeSummaryEmail(summary, baseUrl, now)
    });
  } catch (e) {
    const notConnected = e instanceof ActionError && e.code === "google_not_connected";
    const reason = notConnected
      ? "Google isn't connected"
      : `sending failed (${e instanceof Error ? e.message : "unknown error"})`.slice(0, 300);
    if (!notConnected) console.error(e);
    // Not moving the "new since" mark: tomorrow's summary still includes today's news.
    await recordDailySummary.run(
      { userId: user.id, at: now, outcome: "skipped", via: transport.via, reason, items, pushed },
      ctx
    );
    return notConnected
      ? withPush({ ok: true, sent: false, skipped: reason })
      : withPush({ ok: false, sent: false, error: reason });
  }
  await recordDailySummary.run(
    { userId: user.id, at: now, outcome: "sent", via: transport.via, items, pushed },
    ctx
  );
  return withPush({ ok: true, sent: true, via: transport.via, items });
}
