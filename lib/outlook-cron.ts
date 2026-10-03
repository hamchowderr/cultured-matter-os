import { and, eq, isNotNull } from "drizzle-orm";

import { checkOutlookReplies } from "@/actions";
import { ActionError } from "@/actions/define";
import { db } from "@/db";
import { tasks } from "@/db/schema";

// The daily reply check behind /api/cron/outlook.
export async function runOutlookReplyCheck() {
  // Nothing to watch: skip, so the activity log doesn't fill with empty daily checks.
  const [watching] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.status, "waiting"), isNotNull(tasks.outlookConversationId)))
    .limit(1);
  if (!watching) return { ok: true as const, checked: 0, replied: 0 };
  try {
    const result = await checkOutlookReplies.run({});
    return { ok: true as const, checked: result.checked, replied: result.replied.length };
  } catch (e) {
    if (e instanceof ActionError && e.code === "outlook_not_connected") {
      return { ok: true as const, skipped: "Outlook is not connected" };
    }
    console.error(e);
    return { ok: false as const, error: "Reply check failed" };
  }
}
