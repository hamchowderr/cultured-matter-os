import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod/v4";

import type { Database, Executor } from "@/db";
import { activityLog } from "@/db/schema";

export type ActionContext = { db: Database };

type LogEntry = {
  entityType: string;
  entityId?: string | null;
  summary: string;
  data?: unknown;
};

export class ActionError extends Error {
  constructor(
    public code:
      | "not_found"
      | "invalid"
      | "conflict"
      | "unauthorized"
      // Google hasn't granted the Gmail and Contacts permissions yet; the UI offers "Connect Google".
      | "google_not_connected"
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
      prepare?: (input: z.output<I>, db: Database) => Promise<P>;
      handler: (input: z.output<I>, db: Executor, prepared: P) => Promise<z.input<O>>;
      // Every write lands in activity_log, in the same transaction.
      log: (input: z.output<I>, result: z.output<O>) => LogEntry;
      // Optional step that runs after the transaction commits (e.g. a push notification about
      // what was just written). It never undoes the write: a failure is logged and swallowed.
      // Called from a server action, it runs after the response is sent (see toResult).
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

// What the writes inside one server-action call left for the boundary (toResult) to do once the
// call returns: refresh the page she is on, and run follow-up steps after the response is sent.
// Scripts, cron routes and tests call `.run` outside toResult, so there is no boundary and each
// follow-up runs straight away instead.
type Boundary = { wrote: boolean; followUps: (() => Promise<void>)[] };
const boundary = new AsyncLocalStorage<Boundary>();

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

      const prepared = (config.prepare ? await config.prepare(input, db) : undefined) as P;
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
      const scope = boundary.getStore();
      if (scope) scope.wrote = true;
      const after = config.after;
      if (after) {
        const followUp = async () => {
          try {
            await after(input, committed, db);
          } catch (e) {
            console.error(`${config.name}: follow-up step failed`, e);
          }
        };
        if (scope) scope.followUps.push(followUp);
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

// After a write commits: refresh() sends the page's fresh server render back with the action's
// own response, so the client needs no router.refresh() round trip; after() runs follow-ups
// (push notifications) once the response is on its way. Both only work inside a server action,
// and only writes record anything, so a page render that reads through toResult never gets here.
// Runs at most once per call: it empties the scope before acting on it.
async function settle(scope: Boundary) {
  const { wrote, followUps } = scope;
  scope.wrote = false;
  scope.followUps = [];
  if (wrote) (await import("next/cache")).refresh();
  if (followUps.length) {
    const { after } = await import("next/server");
    for (const followUp of followUps) after(followUp);
  }
}

// Server-action boundary: check the session, then turn thrown errors into a plain result the
// UI can render.
export async function toResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  const scope: Boundary = { wrote: false, followUps: [] };
  try {
    await requireSession();
    const data = await boundary.run(scope, fn);
    await settle(scope);
    return { ok: true, data };
  } catch (e) {
    // A wrapper that wrote and then failed still changed the data on screen.
    await settle(scope).catch((err) => console.error(err));
    if (e instanceof ActionError) return { ok: false, error: { code: e.code, message: e.message } };
    if (e instanceof z.ZodError) {
      return {
        ok: false,
        error: { code: "invalid", message: e.issues[0]?.message ?? "Invalid input" }
      };
    }
    console.error(e);
    return { ok: false, error: { code: "internal", message: "Something went wrong" } };
  }
}
