import { ingestGrants } from "@/ingest/grants";

const results = await ingestGrants();
console.table(results);
process.exit(results.every((r) => r.ok) ? 0 : 1);
