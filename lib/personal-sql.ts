import { type SQL, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

import type { WorkScope } from "./personal";

// Server-side filters for the Business / Personal / All switch (lib/personal.ts), kept apart so
// client components that import the labels don't pull in drizzle.

// SQL test on a projects.business column (null when a task has no project, which counts as
// business).
export function personalSql(business: AnySQLiteColumn): SQL {
  return sql`coalesce(lower(trim(${business})), '') = 'personal'`;
}

// The where-clause for a scope, or undefined for All.
export function scopeWhere(business: AnySQLiteColumn, scope: WorkScope): SQL | undefined {
  if (scope === "personal") return personalSql(business);
  if (scope === "business") return sql`not (${personalSql(business)})`;
  return undefined;
}
