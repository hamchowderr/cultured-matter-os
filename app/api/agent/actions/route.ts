import { handleListAgentActions } from "@/lib/agent-actions";

// The chat agent server reads its tool list here. Public in proxy.ts: it authenticates with
// the AGENT_SERVICE_TOKEN bearer key instead of a session.
export async function GET(request: Request) {
  return handleListAgentActions(request);
}
