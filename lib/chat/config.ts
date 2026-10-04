import type { MastraModelConfig } from "@mastra/core/llm";

// The one place the chat's model is chosen. A Mastra model-router id through the Vercel AI
// Gateway, which reads AI_GATEWAY_API_KEY. Change the model here and nowhere else.
export const CHAT_MODEL = "vercel/anthropic/claude-sonnet-5.5";

// Agent loops stop after 5 steps unless told otherwise. A question that searches, then looks up
// a warm path, then proposes a change needs a few more.
export const CHAT_MAX_STEPS = 8;

// How many rows a search tool returns to the model by default. The actions default to 50, which
// costs tokens and buries the answer.
export const TOOL_ROW_LIMIT = 8;

// Messages from the thread the agent sees on each turn.
export const HISTORY_MESSAGES = 20;

// Under AIMock (tests and the zero-cost dev loop) the same agent talks to the local mock through
// its OpenAI-compatible endpoint instead of the gateway, so no key is read and nothing is billed.
export function chatModel(): MastraModelConfig {
  if (process.env.USE_AIMOCK === "true") {
    const base = (process.env.AIMOCK_URL ?? "http://127.0.0.1:4010").replace(/\/$/, "");
    return { id: "aimock/claude-sonnet", url: `${base}/v1`, apiKey: "mock" };
  }
  return CHAT_MODEL;
}
