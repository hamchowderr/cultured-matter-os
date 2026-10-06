// Whether this server can talk to the assistant's agent server. Without MASTRA_SERVER_URL the
// chat proxy would fall back to localhost:4111, which only exists on a developer's machine, so
// a deployed app with no agent configured hides the chat entirely. In development the
// localhost fallback stays, so a local agent works with no extra setup. Read on the server
// only (the (app) layout, the /chat page and proxy.ts), never in the browser.
export function isChatEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.MASTRA_SERVER_URL?.trim()) || env.NODE_ENV === "development";
}

// The chat's proxy routes (the kit's chat-routes): answered with 503 while the chat is off.
export const CHAT_PROXY_PATHS = [
  "/api/agent-controller",
  "/api/workspace",
  "/api/browser",
  "/api/images"
] as const;

export function isChatProxyPath(pathname: string): boolean {
  return CHAT_PROXY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export const CHAT_DISABLED_MESSAGE =
  "The assistant is not set up on this server yet (MASTRA_SERVER_URL is not configured).";
