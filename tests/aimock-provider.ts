import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// Points every "provider/model" string the app passes to the AI SDK at an AIMock server, through
// the SDK's documented global default provider (globalThis.AI_SDK_DEFAULT_PROVIDER). Production
// code keeps its plain gateway ids and never knows about the mock. Returns the undo.
export function useAimockProvider(baseUrl: string) {
  const previous = globalThis.AI_SDK_DEFAULT_PROVIDER;
  globalThis.AI_SDK_DEFAULT_PROVIDER = createOpenAICompatible({
    name: "aimock",
    baseURL: `${baseUrl.replace(/\/$/, "")}/v1`,
    apiKey: "mock"
  });
  return () => {
    globalThis.AI_SDK_DEFAULT_PROVIDER = previous;
  };
}
