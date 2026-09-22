import { ingestRadar } from "@/ingest/radar";

export const maxDuration = 300;

// Called daily by Vercel Cron (see vercel.json). Vercel sends the CRON_SECRET as a bearer token.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const results = await ingestRadar();
  return Response.json({ results }, { status: results.some((r) => r.ok) ? 200 : 502 });
}
