import { after } from "next/server";

import { draftStream } from "@/lib/grant-draft-stream";
import { getSession } from "@/lib/session";

// Reading a funder's page and PDFs, then one model call: allow up to five minutes.
export const maxDuration = 300;

// The grant page's "Draft application", with progress (lib/grant-draft-stream.ts). The session
// is checked here, not only in proxy.ts. after() keeps the draft running to the end (and saved)
// even if she closes the page mid-draft.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  return draftStream(request, id, {
    ctx: { defer: (task) => after(task) },
    keepAlive: (work) => after(work)
  });
}
