import { ingestMonitors } from "@/ingest/monitors";

export const maxDuration = 300;

// Called daily by Vercel Cron (see vercel.json). Vercel sends the CRON_SECRET as a bearer token.
// Each run checks at most two due pages, so most days scrape nothing.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const results = await ingestMonitors();
  const ok = results.length === 0 || results.some((r) => r.ok);
  return Response.json({ results }, { status: ok ? 200 : 502 });
}
