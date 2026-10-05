// Runs once when the server starts. It tells the chat proxy (lib/mastra-proxy.ts, from
// mastra-chat-kit) who is signed in, so every chat request carries Simone's user id to the
// agent server, and a request with no session is refused before it leaves the app. The
// chat routes run on the Node.js runtime, the same runtime this configures.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { configureChatKitProxy } = await import("@/lib/mastra-proxy");
  const { auth } = await import("@/lib/auth");
  configureChatKitProxy({
    getUserId: async (request) =>
      (await auth.api.getSession({ headers: request.headers }))?.user.id ?? null
  });
}
