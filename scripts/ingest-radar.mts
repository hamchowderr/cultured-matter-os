import { ingestRadar } from "@/ingest/radar";

const results = await ingestRadar();
console.table(results);
process.exit(results.every((r) => r.ok) ? 0 : 1);
