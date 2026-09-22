import { and, asc, eq, getTableColumns, gte, like, lte, or, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { grants } from "@/db/schema";
import { ActionError, defineAction } from "./define";
import { grantSchema, id, limit } from "./schemas";

const grantStatus = z.enum(["watching", "applying", "submitted", "passed"]);
const { raw: _raw, ...grantColumns } = getTableColumns(grants);

export const searchGrants = defineAction({
  name: "searchGrants",
  description:
    "Search grants by text, board status, for-profit eligibility, or deadline window. Soonest deadline first; rolling grants last.",
  kind: "read",
  input: z.object({
    query: z.string().trim().optional(),
    status: grantStatus.optional(),
    forProfitOnly: z.boolean().default(false),
    closingWithinDays: z.number().int().min(1).max(365).optional(),
    limit
  }),
  output: z.object({ grants: z.array(grantSchema) }),
  async handler(input, db) {
    const now = new Date();
    const rows = await db
      .select(grantColumns)
      .from(grants)
      .where(
        and(
          input.query
            ? or(
                like(grants.title, `%${input.query}%`),
                like(grants.agency, `%${input.query}%`),
                like(grants.description, `%${input.query}%`)
              )
            : undefined,
          input.status ? eq(grants.status, input.status) : undefined,
          input.forProfitOnly ? eq(grants.forProfitEligible, true) : undefined,
          input.closingWithinDays
            ? and(
                gte(grants.deadline, now),
                lte(grants.deadline, new Date(now.getTime() + input.closingWithinDays * 86_400_000))
              )
            : undefined
        )
      )
      .orderBy(sql`${grants.deadline} is null`, asc(grants.deadline))
      .limit(input.limit);
    return { grants: rows };
  }
});

export const setGrantStatus = defineAction({
  name: "setGrantStatus",
  description: "Move a grant on the board: watching, applying, submitted or passed.",
  kind: "write",
  input: z.object({ grantId: id, status: grantStatus }),
  output: grantSchema,
  async handler(input, db) {
    const [row] = await db
      .update(grants)
      .set({ status: input.status })
      .where(eq(grants.id, input.grantId))
      .returning(grantColumns);
    if (!row) throw new ActionError("not_found", "Grant not found");
    return row;
  },
  log: (input, grant) => ({
    entityType: "grant",
    entityId: grant.id,
    summary: `Moved ${grant.title} to ${input.status}`
  })
});
