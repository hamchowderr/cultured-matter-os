// A small live check of the chat against the real model, on a throwaway database.
// It makes two turns (a read and a proposed change) and prints the tokens they used.
// Run it with a capped key only:
//   infisical run --projectId <id> --env dev --path=/cultured-matter-os-live-tests --silent -- npx tsx scripts/chat-smoke.mts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { LibSQLStore } from "@mastra/libsql";
import { RequestContext } from "@mastra/core/request-context";
import { migrate } from "drizzle-orm/libsql/migrator";

import { createDb } from "@/db";
import { createChatAgent, createChatMemory } from "@/lib/chat/agent";
import { CHAT_MAX_STEPS, CHAT_MODEL } from "@/lib/chat/config";
import { pageContextMessage } from "@/lib/chat/page-context";
import { CHAT_SEED, seedChatData } from "@/tests/fixtures/chat-seed";

if (!process.env.AI_GATEWAY_API_KEY) throw new Error("AI_GATEWAY_API_KEY is not set");
if (process.env.USE_AIMOCK === "true") throw new Error("Unset USE_AIMOCK for the live check");

const dir = mkdtempSync(join(tmpdir(), "cmos-chat-smoke-"));
const db = createDb(pathToFileURL(join(dir, "app.db")).href);
await migrate(db, { migrationsFolder: "db/migrations" });
await seedChatData(db);
const memory = createChatMemory(
  new LibSQLStore({ id: "chat-smoke", url: pathToFileURL(join(dir, "mastra.db")).href })
);
const agent = createChatAgent({ db, memory });
const userId = "smoke-user";
const thread = "smoke-thread";
await memory.createThread({ threadId: thread, resourceId: userId, title: "Smoke" });

const turns = [
  { text: "Which grants close in the next month?", page: { path: "/grants" } },
  {
    text: "Please shortlist this company.",
    page: {
      path: "/radar",
      record: { type: "company" as const, id: CHAT_SEED.companyId, label: "Soliome" }
    }
  }
];

let input = 0;
let output = 0;
console.log(`model: ${CHAT_MODEL}`);
for (const turn of turns) {
  const requestContext = new RequestContext();
  requestContext.set("userId", userId);
  const result = await agent.generate(turn.text, {
    memory: { thread, resource: userId },
    maxSteps: CHAT_MAX_STEPS,
    requestContext,
    system: pageContextMessage(turn.page)
  });
  input += result.usage?.inputTokens ?? 0;
  output += result.usage?.outputTokens ?? 0;
  const tools = result.steps.flatMap((s) => s.toolCalls.map((c) => c.payload?.toolName ?? c));
  console.log(`\n> ${turn.text}\ntools: ${JSON.stringify(tools)}\n${result.text}`);
  console.log(`usage: ${JSON.stringify(result.usage)}`);
}

const [approval] = await db.query.approvals.findMany();
console.log(`\napproval queued: ${approval ? `${approval.action} — ${approval.summary} (${approval.status})` : "none"}`);
// Sonnet 5.5 on the gateway: $2 per million input tokens, $10 per million output tokens.
console.log(`tokens: ${input} in, ${output} out; about $${((input * 2 + output * 10) / 1e6).toFixed(4)}`);
