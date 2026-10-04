import { chatAgent } from "@/lib/chat/agent";
import { listThreads } from "@/lib/chat/server";
import { getSession } from "@/lib/session";

// The signed-in user's conversations, newest first.
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const memory = await chatAgent().getMemory();
  if (!memory) return Response.json({ threads: [] });
  return Response.json({ threads: await listThreads(memory, session.user.id) });
}
