import { chatAgent } from "@/lib/chat/agent";
import { ChatNotFound, deleteThread, threadMessages } from "@/lib/chat/server";
import { getSession } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

// One conversation's messages, in the shape useChat expects.
export async function GET(_request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const memory = await chatAgent().getMemory();
  if (!memory) return Response.json({ messages: [] });
  try {
    const messages = await threadMessages(memory, session.user.id, (await params).id);
    return Response.json({ messages });
  } catch (e) {
    if (e instanceof ChatNotFound) return notFound();
    throw e;
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const memory = await chatAgent().getMemory();
  if (!memory) return notFound();
  try {
    await deleteThread(memory, session.user.id, (await params).id);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ChatNotFound) return notFound();
    throw e;
  }
}
