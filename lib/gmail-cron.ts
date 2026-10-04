import { and, eq, isNotNull } from "drizzle-orm";

import { checkGmailReplies } from "@/actions";
import { ActionError } from "@/actions/define";
import { db } from "@/db";
import { tasks } from "@/db/schema";

// The daily reply check behind /api/cron/gmail.
export async function runGmailReplyCheck() {
  // Nothing to watch: skip, so the activity log doesn't fill with empty daily checks.
  const [watching] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.status, "waiting"), isNotNull(tasks.emailThreadId)))
    .limit(1);
  if (!watching) return { ok: true as const, checked: 0, replied: 0 };
  try {
    const result = await checkGmailReplies.run({});
    return { ok: true as const, checked: result.checked, replied: result.replied.length };
  } catch (e) {
    if (e instanceof ActionError && e.code === "google_not_connected") {
      return { ok: true as const, skipped: "Gmail is not connected" };
    }
    console.error(e);
    return { ok: false as const, error: "Reply check failed" };
  }
}
