import { runOutlookReplyCheck } from "@/lib/outlook-cron";

export const maxDuration = 300;

// Called daily by Vercel Cron (see vercel.json; Hobby allows one run per day per job). Moves
// tasks waiting for a response to replied when their Outlook thread has a reply. No webhooks.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await runOutlookReplyCheck();
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
