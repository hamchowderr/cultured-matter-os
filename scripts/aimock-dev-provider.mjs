// The zero-cost local dev loop: makes AIMock the AI SDK's default provider for a dev server
// (globalThis.AI_SDK_DEFAULT_PROVIDER, as the AI SDK documents), so every model call goes to the
// mock and nothing reaches the gateway or is billed. Start AIMock first, then load this before
// the app:
//   npx llmock -p 4010 -f tests/fixtures/voice-aimock.json
//   AIMOCK_URL=http://127.0.0.1:4010 NODE_OPTIONS="--import ./scripts/aimock-dev-provider.mjs" npx next dev -p 3001
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const base = (process.env.AIMOCK_URL ?? "http://127.0.0.1:4010").replace(/\/$/, "");
globalThis.AI_SDK_DEFAULT_PROVIDER = createOpenAICompatible({
  name: "aimock",
  baseURL: `${base}/v1`,
  apiKey: "mock"
});
