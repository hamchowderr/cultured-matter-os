import { createUIMessageStreamResponse } from "ai";

import { chatAgent } from "@/lib/chat/agent";
import { ChatNotFound, chatRequestSchema, streamChat } from "@/lib/chat/server";
import { getSession } from "@/lib/session";

// A turn can search, look up a warm path and propose a change; give it room.
export const maxDuration = 60;

// One chat turn: her new message plus the page she is on, streamed back for useChat.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });

  const parsed = chatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid message" }, { status: 400 });

  try {
    const stream = await streamChat({
      agent: chatAgent(),
      userId: session.user.id,
      request: parsed.data,
      abortSignal: request.signal
    });
    return createUIMessageStreamResponse({ stream });
  } catch (e) {
    if (e instanceof ChatNotFound) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }
    throw e;
  }
}
