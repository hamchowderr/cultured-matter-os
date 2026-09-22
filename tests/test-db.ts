import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { migrate } from "drizzle-orm/libsql/migrator";

import { createDb } from "@/db";

// A fresh migrated database file per test file.
export async function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), "cmos-test-"));
  const db = createDb(pathToFileURL(join(dir, "test.db")).href);
  await migrate(db, { migrationsFolder: "db/migrations" });
  return {
    db,
    cleanup: () => {
      db.$client.close();
      // Windows can keep the file locked briefly after close; the OS temp dir is cleaned anyway.
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {}
    }
  };
}
