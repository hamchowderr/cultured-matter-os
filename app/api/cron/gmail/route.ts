import { runGmailReplyCheck } from "@/lib/gmail-cron";

export const maxDuration = 300;

// Called hourly by Vercel Cron, at half past (see vercel.json). Moves
// tasks waiting for a response to replied when their Gmail thread has a reply. No webhooks.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await runGmailReplyCheck();
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
