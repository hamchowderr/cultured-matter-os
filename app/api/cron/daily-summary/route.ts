import { runDailySummary } from "@/lib/daily-summary";

export const maxDuration = 60;

// Called daily by Vercel Cron (see vercel.json) after the radar, grants, monitors and Gmail
// reply checks, so the summary covers what they found. Hobby runs a job once a day somewhere
// inside its scheduled hour, so this job is scheduled an hour after the last of them.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await runDailySummary();
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
