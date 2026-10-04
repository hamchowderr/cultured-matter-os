import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { inject } from "vitest";

import { createDb } from "@/db";

// A fresh migrated database file per test file, copied from the template global-setup migrated.
export async function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), "cmos-test-"));
  const file = join(dir, "test.db");
  copyFileSync(inject("templateDb"), file);
  const db = createDb(pathToFileURL(file).href);
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
