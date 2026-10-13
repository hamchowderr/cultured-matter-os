import { DrizzleQueryError } from "drizzle-orm/errors";
import { z } from "zod/v4";

import type { Database, Executor } from "@/db";
import { activityLog } from "@/db/schema";

export type ActionContext = {
  db?: Database;
  // Where a write's post-commit step goes. Server actions pass after() from next/server so the
  // step runs once the response is sent; cron routes, scripts and tests leave it out and the
  // step is awaited before .run returns.
  defer?: (task: () => Promise<void>) => void;
  // Progress from a long write's prepare step (the grant page's draft progress); most callers
  // leave it out.
  onStep?: (step: string) => void;
};

type LogEntry = {
  entityType: string;
  entityId?: string | null;
  summary: string;
  data?: unknown;
};

// What may go in a server log for a thrown error. A failed query's message and `params` carry
// the values being written (an EIN, a SAM UEI, a contact's details), so it is reduced to the
// error type and the database's own reason, which names tables and columns, never values.
// lib/agent-actions.ts (the chat agent's endpoint) should log through this too.
export function loggableError(e: unknown): string | unknown {
  if (e instanceof DrizzleQueryError) {
    const cause = e.cause instanceof Error ? `${e.cause.name}: ${e.cause.message}` : "no cause";
    return `DrizzleQueryError (${cause})`;
  }
  return e;
}

export class ActionError extends Error {
  constructor(
    public code:
      | "not_found"
      | "invalid"
      | "conflict"
      | "unauthorized"
      // Google hasn't granted the Gmail and Contacts permissions yet; the UI offers "Sync Google".
      | "google_not_connected"
      // Google asked us to slow down (its usage limits) even after retrying; try again later.
      | "rate_limited"
      // An outside service (e.g. Gmail) failed.
      | "unavailable",
    message: string
  ) {
    super(message);
    this.name = "ActionError";
  }
}

type Handler<I, O> = (input: I, db: Executor) => Promise<O>;

type ActionConfig<I extends z.ZodType, O extends z.ZodType, P = undefined> = {
  name: string;
  description: string;
  input: I;
  output: O;
} & (
  | { kind: "read"; handler: Handler<z.output<I>, z.input<O>> }
  | {
      kind: "write";
      // Optional step that runs before the transaction opens: network calls (Gmail, People API,
      // token refresh) must not hold the database lock. Its result is passed to the handler.
      prepare?: (input: z.output<I>, db: Database, ctx: ActionContext) => Promise<P>;
      handler: (input: z.output<I>, db: Executor, prepared: P) => Promise<z.input<O>>;
      // Every write lands in activity_log, in the same transaction.
      log: (input: z.output<I>, result: z.output<O>) => LogEntry;
      // Optional step that runs after the transaction commits (e.g. a push notification about
      // what was just written). It never undoes the write: a failure is logged and swallowed.
      // With ctx.defer (server actions pass after()), it runs after the response is sent.
      after?: (input: z.output<I>, result: z.output<O>, db: Database) => Promise<void>;
    }
);

export type Action<
  I extends z.ZodType = z.ZodType,
  O extends z.ZodType = z.ZodType,
  P = undefined
> = ActionConfig<I, O, P> & {
  run: (input: z.input<I>, ctx?: ActionContext) => Promise<z.output<O>>;
};

async function defaultDb(): Promise<Database> {
  return (await import("@/db")).db;
}

export function defineAction<I extends z.ZodType, O extends z.ZodType, P = undefined>(
  config: ActionConfig<I, O, P>
): Action<I, O, P> {
  return {
    ...config,
    async run(rawInput, ctx) {
      const input = config.input.parse(rawInput);
      const db = ctx?.db ?? (await defaultDb());

      if (config.kind === "read") {
        return config.output.parse(await config.handler(input, db));
      }

      const prepared = (
        config.prepare ? await config.prepare(input, db, ctx ?? {}) : undefined
      ) as P;
      const committed = await db.transaction(async (tx) => {
        const result = config.output.parse(await config.handler(input, tx, prepared));
        const entry = config.log(input, result);
        await tx.insert(activityLog).values({
          action: config.name,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          summary: entry.summary,
          data: entry.data ?? null
        });
        return result;
      });
      const after = config.after;
      if (after) {
        const followUp = async () => {
          try {
            await after(input, committed, db);
          } catch (e) {
            console.error(`${config.name}: follow-up step failed`, loggableError(e));
          }
        };
        if (ctx?.defer) ctx.defer(followUp);
        else await followUp();
      }
      return committed;
    }
  };
}

export type ActionResult<T> =
  { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

// Every server action in actions/server.ts passes through toResult, so this is the one place
// that refuses anonymous calls. Imported lazily so tests and scripts that call `.run` directly
// never load the auth stack.
async function requireSession() {
  const { getSession } = await import("@/lib/session");
  if (!(await getSession())) throw new ActionError("unauthorized", "Please sign in again.");
}

// Server-action boundary: check the session, then turn thrown errors into a plain result the
// UI can render. A write that changes what is on the page passes { refresh: true }: once it
// succeeds, refresh() from next/cache sends the fresh page back with this same response, so the
// client needs no router.refresh() round trip. refresh() only works inside a server action, so
// page renders (which read through toResult) never pass it. Any post-commit step was handed to
// ctx.defer inside fn, before this refresh runs, so a refresh error cannot lose it.
export async function toResult<T>(
  fn: () => Promise<T>,
  options: { refresh?: boolean } = {}
): Promise<ActionResult<T>> {
  try {
    await requireSession();
    const data = await fn();
    if (options.refresh) (await import("next/cache")).refresh();
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, error: { code: e.code, message: e.message } };
    if (e instanceof z.ZodError) {
      return {
        ok: false,
        error: { code: "invalid", message: e.issues[0]?.message ?? "Invalid input" }
      };
    }
    console.error(loggableError(e));
    return { ok: false, error: { code: "internal", message: "Something went wrong" } };
  }
}
