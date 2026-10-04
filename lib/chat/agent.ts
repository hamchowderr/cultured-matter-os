import { Agent } from "@mastra/core/agent";
import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";

import type { Database } from "@/db";
import { chatModel, HISTORY_MESSAGES } from "@/lib/chat/config";
import { chatTools } from "@/lib/chat/tools";

export const CHAT_AGENT_ID = "assistant";

export const CHAT_INSTRUCTIONS = `You are the assistant inside Cultured Matter OS, the app Simone uses to run Cultured Matter.
Cultured Matter pairs early-stage climate and materials startups with culturally influential brands.

How to answer:
- Write plain, warm and short replies: one to three sentences, or a short list. No jargon, no headings.
- Only state facts that come from your tools. Never invent companies, people, grants, dates, numbers or links. If a tool finds nothing, say so and suggest what to try.
- Look things up before you answer a question about her data. The app shows what you find as cards, so do not repeat every field; point out what matters.
- To change anything (star, shortlist or pass a company, move a grant, create or update a task, a project or an inbox note), call the matching "propose" tool. It shows her an approval card and nothing changes until she taps Approve. Say that it is waiting for her approval. Never say a change is done before she approves it.
- You cannot send email or messages.
- When she says "this", "this company" or "this one", use the page and record she is looking at, given below.`;

// One store for the whole server: the app's own Turso database. Mastra keeps its threads and
// messages in its own mastra_* tables, which it creates on first use.
let store: LibSQLStore | null = null;
function chatStore(): LibSQLStore {
  store ??= new LibSQLStore({
    id: "chat-storage",
    url: process.env.TURSO_DATABASE_URL ?? "file:local.db",
    ...(process.env.TURSO_AUTH_TOKEN ? { authToken: process.env.TURSO_AUTH_TOKEN } : {})
  });
  return store;
}

export function createChatMemory(storage: LibSQLStore = chatStore()): Memory {
  return new Memory({
    storage,
    options: {
      lastMessages: HISTORY_MESSAGES,
      // Titles come from her first message (see the chat route), so naming a thread costs nothing.
      generateTitle: false
    }
  });
}

export function createChatAgent(opts: { db?: Database; memory?: Memory } = {}): Agent {
  return new Agent({
    id: CHAT_AGENT_ID,
    name: "Cultured Matter assistant",
    instructions: CHAT_INSTRUCTIONS,
    model: chatModel(),
    tools: chatTools(opts.db),
    memory: opts.memory ?? createChatMemory()
  });
}

let mastra: Mastra | null = null;
export function chatMastra(): Mastra {
  mastra ??= new Mastra({
    agents: { [CHAT_AGENT_ID]: createChatAgent() },
    storage: chatStore()
  });
  return mastra;
}

export function chatAgent(): Agent {
  return chatMastra().getAgentById(CHAT_AGENT_ID);
}
