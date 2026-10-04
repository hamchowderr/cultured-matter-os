import type { Agent } from "@mastra/core/agent";
import type { MastraMemory } from "@mastra/core/memory";
import { RequestContext } from "@mastra/core/request-context";
import { toAISdkStream } from "@mastra/ai-sdk";
import { toAISdkMessages } from "@mastra/ai-sdk/ui";
import { createUIMessageStream, type UIMessage } from "ai";
import { z } from "zod/v4";

import { CHAT_MAX_STEPS } from "@/lib/chat/config";
import { pageContextMessage, pageContextSchema } from "@/lib/chat/page-context";

// The chat's server side, shared by the route handlers and the tests. Every thread belongs to
// one signed-in user: Mastra's resourceId is the user id, and every read checks it.

export const chatRequestSchema = z.object({
  threadId: z.string().min(1).max(100),
  // Only the new message; the thread in memory holds the rest.
  message: z.object({
    id: z.string(),
    role: z.literal("user"),
    parts: z.array(z.record(z.string(), z.unknown())).min(1)
  }),
  page: pageContextSchema.optional()
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type ChatThread = { id: string; title: string; updatedAt: string };

export class ChatNotFound extends Error {}

// A thread title from her first message: no model call needed.
export function titleFrom(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "New chat";
  return flat.length > 60 ? `${flat.slice(0, 57).trimEnd()}…` : flat;
}

function textOf(message: ChatRequest["message"]): string {
  return message.parts
    .map((p) => (p.type === "text" && typeof p.text === "string" ? p.text : ""))
    .join(" ");
}

async function ownedThread(memory: MastraMemory, userId: string, threadId: string) {
  const thread = await memory.getThreadById({ threadId });
  if (thread && thread.resourceId !== userId) throw new ChatNotFound();
  return thread;
}

// Runs one turn and returns the AI SDK UI message stream for useChat.
export async function streamChat(opts: {
  agent: Agent;
  userId: string;
  request: ChatRequest;
  abortSignal?: AbortSignal;
}) {
  const { agent, userId, request } = opts;
  const memory = await agent.getMemory();
  if (!memory) throw new Error("The chat agent has no memory");
  const thread = await ownedThread(memory, userId, request.threadId);
  if (!thread) {
    await memory.createThread({
      threadId: request.threadId,
      resourceId: userId,
      title: titleFrom(textOf(request.message))
    });
  }

  const requestContext = new RequestContext();
  requestContext.set("userId", userId);
  const system = pageContextMessage(request.page);

  const stream = await agent.stream([request.message as unknown as UIMessage], {
    memory: { thread: request.threadId, resource: userId },
    maxSteps: CHAT_MAX_STEPS,
    requestContext,
    ...(system ? { system } : {}),
    ...(opts.abortSignal ? { abortSignal: opts.abortSignal } : {})
  });

  return createUIMessageStream({
    execute: async ({ writer }) => {
      for await (const part of toAISdkStream(stream, { from: "agent", version: "v7" })) {
        await writer.write(part);
      }
    },
    onError: () => "Sorry, something went wrong. Please try again."
  });
}

export async function listThreads(memory: MastraMemory, userId: string): Promise<ChatThread[]> {
  const { threads } = await memory.listThreads({
    filter: { resourceId: userId },
    orderBy: { field: "updatedAt", direction: "DESC" },
    perPage: 100,
    page: 0
  });
  return threads.map((t) => ({
    id: t.id,
    title: t.title || "New chat",
    updatedAt: new Date(t.updatedAt).toISOString()
  }));
}

export async function threadMessages(memory: MastraMemory, userId: string, threadId: string) {
  const thread = await ownedThread(memory, userId, threadId);
  if (!thread) return [];
  const { messages } = await memory.recall({ threadId, resourceId: userId, perPage: false });
  return toAISdkMessages(messages, { version: "v7" });
}

export async function deleteThread(memory: MastraMemory, userId: string, threadId: string) {
  const thread = await ownedThread(memory, userId, threadId);
  if (!thread) throw new ChatNotFound();
  await memory.deleteThread(threadId);
}
