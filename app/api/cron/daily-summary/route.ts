import { runDailySummary } from "@/lib/daily-summary";

export const maxDuration = 60;

// Called daily by Vercel Cron (see vercel.json) after the morning radar, grants and monitors
// runs, so the summary covers what they found. The Gmail reply check runs at half past each
// hour, so it never overlaps this job on the hour.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await runDailySummary();
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
