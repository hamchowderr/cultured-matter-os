import { handleRunAgentJob } from "@/lib/agent-jobs";

// One ingestion source per call: a monitored page's Firecrawl scrape can take a few minutes.
export const maxDuration = 300;

// Scheduled ingestion, called by the agent server's workflows (lib/agent-jobs.ts). Public in
// proxy.ts: it authenticates with the AGENT_SERVICE_TOKEN bearer key instead of a session.
export async function POST(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return handleRunAgentJob(request, name);
}
