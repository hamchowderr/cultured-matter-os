// One-time fill of Settings → Business from her website copy, the PRD and her May notes.
// Only empty fields are filled, so running it again changes nothing she has edited.
// Run with the database env (TURSO_DATABASE_URL) injected, e.g. under infisical.
import { db } from "@/db";
import { businessContext } from "@/lib/business-profile";
import { loadBusinessProfile } from "@/actions/business";
import { seedBusinessProfile } from "@/lib/business-seed";

const filled = await seedBusinessProfile(db);
console.log(
  filled.length
    ? `Filled: ${filled.join(", ")}`
    : "Nothing to fill: every seeded field already has a value."
);
console.log("\nbusinessContext():\n" + businessContext(await loadBusinessProfile(db)));
process.exit(0);
