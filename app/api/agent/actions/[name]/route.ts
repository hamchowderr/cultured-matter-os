import { handleRunAgentAction } from "@/lib/agent-actions";

// draftGrantApplication reads a funder's page and PDFs, then makes one model call: allow up to
// five minutes, as the grant page's own draft route does.
export const maxDuration = 300;

// Runs one named action for the chat agent server. Public in proxy.ts: it authenticates with
// the AGENT_SERVICE_TOKEN bearer key instead of a session.
export async function POST(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return handleRunAgentAction(request, name);
}
