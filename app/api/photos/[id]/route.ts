import { serveCapturePhoto } from "@/lib/capture";
import { getSession } from "@/lib/session";

// A capture's photo, streamed from the private Blob store to the signed-in user. The session is
// checked here, next to the read, not only in proxy.ts.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return new Response("Unauthorized", { status: 401 });
  return serveCapturePhoto(request, (await params).id);
}
