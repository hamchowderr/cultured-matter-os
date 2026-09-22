import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

export function createDb(url: string, authToken?: string) {
  return drizzle(createClient({ url, authToken }), { schema });
}

export type Database = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
// Anything a handler can query through: the database or an open transaction.
export type Executor = Database | Tx;

// Local development uses a SQLite file; deployments point at Turso.
export const db = createDb(
  process.env.TURSO_DATABASE_URL ?? "file:local.db",
  process.env.TURSO_AUTH_TOKEN
);

export { schema };
