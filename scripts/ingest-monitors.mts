import { ingestMonitors } from "@/ingest/monitors";

// Spends Firecrawl credits (5 per due page). Needs FIRECRAWL_API_KEY.
const results = await ingestMonitors();
console.table(results);
process.exit(results.every((r) => r.ok) ? 0 : 1);
