import { calendarFeed } from "@/actions/preferences";
import type { Database } from "@/db";
import { buildCalendar } from "@/lib/calendar-ics";

// GET /api/calendar/<token>.ics. Public in proxy.ts; the token in the path is the only key, so
// a wrong or reset token is a plain 404 (nothing says whether a feed exists).
export async function calendarResponse(
  file: string,
  baseUrl: string,
  opts: { db?: Database; now?: Date } = {}
) {
  const notFound = () => new Response("Not found", { status: 404 });
  const m = file.match(/^([A-Za-z0-9_-]{16,128})\.ics$/);
  if (!m) return notFound();
  const feed = await calendarFeed.run(
    { token: m[1], now: opts.now },
    opts.db ? { db: opts.db } : undefined
  );
  if (!feed) return notFound();
  return new Response(buildCalendar(feed.events, baseUrl), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="cultured-matter.ics"',
      // Private: the URL is a secret, so no shared caches.
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex"
    }
  });
}
