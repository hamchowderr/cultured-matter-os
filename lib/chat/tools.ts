import { createTool } from "@mastra/core/tools";
import { z } from "zod/v4";

import { CHAT_APPROVAL_ACTIONS, CHAT_READ_ACTIONS } from "@/actions/chat";
import { ActionError, type AnyAction } from "@/actions/define";
import { requestApproval } from "@/actions/work";
import type { Database } from "@/db";
import { TOOL_ROW_LIMIT } from "@/lib/chat/config";

// The chat assistant's tools: the app's named actions, wrapped with Mastra createTool. Reads run
// straight away. Writes become "propose" tools that queue an approval card; the change runs only
// when Simone taps Approve.

// What every tool can read from the request: who is signed in.
export type ChatRequestContext = { userId: string };

// Tool name for a write: the model sees "propose…" so it never thinks the change already happened.
export const proposeToolName = (action: string) =>
  `propose${action[0].toUpperCase()}${action.slice(1)}`;

// Inputs the server fills in, so the model never has to guess them.
const SERVER_FILLED: Partial<Record<string, (ctx: ChatRequestContext) => Record<string, unknown>>> =
  {
    listNotifications: (ctx) => ({ userId: ctx.userId })
  };

type Shape = Record<string, z.ZodType>;

function toolInput(action: AnyAction): z.ZodObject<Shape> {
  let schema = action.input as unknown as z.ZodObject<Shape>;
  const filled = SERVER_FILLED[action.name];
  if (filled) {
    // Leave out what the server fills in; the other fields of these actions are optional.
    const keep = Object.fromEntries(
      Object.entries(schema.shape).filter(([key]) =>
        ["userId", "radarSince", "now"].every((k) => k !== key)
      )
    );
    schema = z.object(keep);
  }
  // Searches return a few rows by default, not fifty.
  if ("limit" in schema.shape) {
    schema = schema.extend({
      limit: z.number().int().min(1).max(50).default(TOOL_ROW_LIMIT)
    });
  }
  return schema;
}

// An action error becomes a plain message the assistant can pass on, instead of a crash.
async function safely<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ActionError) return { error: e.message };
    if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Invalid input" };
    throw e;
  }
}

function contextOf(requestContext: { get(key: string): unknown } | undefined): ChatRequestContext {
  const userId = requestContext?.get("userId");
  if (typeof userId !== "string" || !userId) throw new Error("Chat tools need a signed-in user");
  return { userId };
}

// Some reads (listTasks, listProjects) have no limit. Long lists are cut so one answer can't
// fill the model's context; the count of what was left out stays.
export const MAX_LIST_ROWS = 25;
export function capLists(output: unknown): unknown {
  if (!output || typeof output !== "object" || Array.isArray(output)) return output;
  const capped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(output)) {
    if (Array.isArray(value) && value.length > MAX_LIST_ROWS) {
      capped[key] = value.slice(0, MAX_LIST_ROWS);
      capped[`${key}LeftOut`] = value.length - MAX_LIST_ROWS;
    } else {
      capped[key] = value;
    }
  }
  return capped;
}

function readTool(action: AnyAction, db?: Database) {
  return createTool({
    id: action.name,
    description: action.description,
    inputSchema: toolInput(action),
    execute: async (input, context) => {
      const fill = SERVER_FILLED[action.name];
      const full = fill ? { ...input, ...fill(contextOf(context?.requestContext)) } : input;
      return safely(async () => capLists(await action.run(full as never, db ? { db } : undefined)));
    }
  });
}

const summaryField = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .describe(
    "One short, plain sentence saying what will change if she approves, e.g. 'Shortlist Soliome'."
  );

function proposeTool(action: AnyAction, db?: Database) {
  const input = toolInput(action);
  return createTool({
    id: proposeToolName(action.name),
    description:
      `Ask Simone to approve this change: ${action.description} ` +
      "Nothing changes until she taps Approve on the card this shows her.",
    inputSchema: input.extend({ summary: summaryField }),
    execute: async ({ summary, ...payload }) =>
      safely(async () => {
        // Check the input now, so a bad proposal fails here and not when she approves it.
        action.input.parse(payload);
        const approval = await requestApproval.run(
          { action: action.name, summary: String(summary), payload },
          db ? { db } : undefined
        );
        return { approval };
      })
  });
}

// Every tool, keyed by the name the model calls it by. Tests pass their own database.
export function chatTools(db?: Database) {
  return Object.fromEntries([
    ...CHAT_READ_ACTIONS.map((a) => [a.name, readTool(a, db)] as const),
    ...CHAT_APPROVAL_ACTIONS.map((a) => [proposeToolName(a.name), proposeTool(a, db)] as const)
  ]);
}

export const CHAT_READ_TOOL_NAMES = CHAT_READ_ACTIONS.map((a) => a.name);
export const CHAT_PROPOSE_TOOL_NAMES = CHAT_APPROVAL_ACTIONS.map((a) => proposeToolName(a.name));
