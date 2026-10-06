import { handleRunAgentAction } from "@/lib/agent-actions";

// Runs one named action for the chat agent server. Public in proxy.ts: it authenticates with
// the AGENT_SERVICE_TOKEN bearer key instead of a session.
export async function POST(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return handleRunAgentAction(request, name);
}
