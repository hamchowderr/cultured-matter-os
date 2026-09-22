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
    public code: "not_found" | "invalid" | "conflict",
    message: string
  ) {
    super(message);
    this.name = "ActionError";
  }
}

type Handler<I, O> = (input: I, db: Executor) => Promise<O>;

type ActionConfig<I extends z.ZodType, O extends z.ZodType> = {
  name: string;
  description: string;
  input: I;
  output: O;
} & (
  | { kind: "read"; handler: Handler<z.output<I>, z.input<O>> }
  | {
      kind: "write";
      handler: Handler<z.output<I>, z.input<O>>;
      // Every write lands in activity_log, in the same transaction.
      log: (input: z.output<I>, result: z.output<O>) => LogEntry;
    }
);

export type Action<
  I extends z.ZodType = z.ZodType,
  O extends z.ZodType = z.ZodType
> = ActionConfig<I, O> & {
  run: (input: z.input<I>, ctx?: ActionContext) => Promise<z.output<O>>;
};

async function defaultDb(): Promise<Database> {
  return (await import("@/db")).db;
}

export function defineAction<I extends z.ZodType, O extends z.ZodType>(
  config: ActionConfig<I, O>
): Action<I, O> {
  return {
    ...config,
    async run(rawInput, ctx) {
      const input = config.input.parse(rawInput);
      const db = ctx?.db ?? (await defaultDb());

      if (config.kind === "read") {
        return config.output.parse(await config.handler(input, db));
      }

      return db.transaction(async (tx) => {
        const result = config.output.parse(await config.handler(input, tx));
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
    }
  };
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

// Server-action boundary: turn thrown errors into a plain result the UI can render.
export async function toResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
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
