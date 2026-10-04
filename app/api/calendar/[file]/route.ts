import { calendarResponse } from "@/lib/calendar-feed";

export const dynamic = "force-dynamic";

// Private calendar feed (/api/calendar/<token>.ics) that Apple Calendar subscribes to. Public in
// proxy.ts: it checks the token instead of a session. Settings creates and resets the link.
export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  return calendarResponse(file, new URL(request.url).origin);
}
