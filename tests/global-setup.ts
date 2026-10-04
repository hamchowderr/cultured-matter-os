import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    templateDb: string;
  }
}

// Migrate one template database for the whole run; freshDb copies it instead of
// re-running every migration per test file, which crawls when workers compete for disk.
export default async function setup(project: TestProject) {
  const dir = mkdtempSync(join(tmpdir(), "cmos-template-"));
  const file = join(dir, "template.db");
  const client = createClient({ url: pathToFileURL(file).href });
  await migrate(drizzle(client), { migrationsFolder: "db/migrations" });
  // WAL is stored in the file, so every copy gets it: commits append to one log instead of
  // creating and deleting a journal file each time, which is slow on Windows.
  await client.execute("PRAGMA journal_mode = WAL");
  client.close();
  project.provide("templateDb", file);
  return () => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {}
  };
}
