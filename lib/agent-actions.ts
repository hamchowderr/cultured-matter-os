import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod/v4";

import { type Action, ActionError, allActions } from "@/actions";
import { type ActionContext, loggableError } from "@/actions/define";

// The named actions the chat agent (the cultured-matter-agent server) may call as tools.
// The agent server reads this list at boot and builds one tool per action from its JSON
// Schema, so the schemas live only here. Write actions run only after Simone approves them
// in the chat's own approval card.

// Left out on purpose:
// - requestApproval, decideApproval: the app's approval queue. Chat approvals are the chat's.
// - draftFollowUp, setNewsletter, setDailyEmail: they lead to email being sent.
// - syncGoogle, checkGmailReplies, importContacts: long imports, run from their own screens
//   or the cron.
// - getUserSettings, resetCalendarLink: the private calendar feed link.
// - markNotificationsRead, setWorkScope, pushStatus, setPushPreferences: screen and device
//   settings, not business data.
const EXCLUDED = new Set([
  "requestApproval",
  "decideApproval",
  "draftFollowUp",
  "setNewsletter",
  "setDailyEmail",
  "syncGoogle",
  "checkGmailReplies",
  "importContacts",
  "getUserSettings",
  "resetCalendarLink",
  "markNotificationsRead",
  "setWorkScope",
  "pushStatus",
  "setPushPreferences"
]);

export const agentActions: readonly Action[] = (allActions as readonly Action[]).filter(
  (a) => !EXCLUDED.has(a.name)
);

export type AgentActionInfo = {
  name: string;
  description: string;
  kind: "read" | "write";
  inputSchema: unknown;
};

export function describeAgentActions(): AgentActionInfo[] {
  return agentActions.map((a) => ({
    name: a.name,
    description: a.description,
    kind: a.kind,
    // The input side: defaults are optional to the caller. Dates (z.coerce.date) go over the
    // wire as ISO strings; anything else JSON Schema can't express becomes an open schema.
    inputSchema: z.toJSONSchema(a.input, {
      io: "input",
      unrepresentable: "any",
      override: ({ zodSchema, jsonSchema }) => {
        if (zodSchema._zod.def.type === "date") {
          jsonSchema.type = "string";
          jsonSchema.format = "date-time";
        }
      }
    })
  }));
}

// Constant-time compare. Hashing first gives both sides the same length.
function keyMatches(given: string, expected: string) {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// The agent server sends AGENT_SERVICE_TOKEN as a Bearer key. No token configured means the
// endpoint is closed.
export function agentAuthorized(request: Request) {
  const expected = process.env.AGENT_SERVICE_TOKEN;
  if (!expected) return false;
  const match = /^Bearer\s+(.+)$/i.exec((request.headers.get("authorization") ?? "").trim());
  return !!match && keyMatches(match[1].trim(), expected.trim());
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const STATUS: Record<string, number> = {
  not_found: 404,
  invalid: 400,
  conflict: 409,
  unauthorized: 403,
  google_not_connected: 409,
  unavailable: 502
};

export async function handleListAgentActions(request: Request) {
  if (!agentAuthorized(request)) return json({ error: "unauthorized" }, 401);
  return json({ actions: describeAgentActions() });
}

export async function handleRunAgentAction(request: Request, name: string, ctx?: ActionContext) {
  if (!agentAuthorized(request)) return json({ error: "unauthorized" }, 401);
  const action = agentActions.find((a) => a.name === name);
  if (!action)
    return json({ ok: false, error: { code: "not_found", message: "No such action" } }, 404);

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json({ ok: false, error: { code: "invalid", message: "Body must be JSON" } }, 400);
  }

  // Bad input is the caller's mistake (400). Checked here, before running, so that a
  // ZodError from the action's OUTPUT schema below reads as what it is: our bug (500).
  const parsed = action.input.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input";
    return json({ ok: false, error: { code: "invalid", message } }, 400);
  }

  try {
    return json({ ok: true, data: await action.run(input, ctx) });
  } catch (e) {
    if (e instanceof ActionError) {
      return json(
        { ok: false, error: { code: e.code, message: e.message } },
        STATUS[e.code] ?? 400
      );
    }
    // A database error's message carries the query's parameters (her data: an EIN, an
    // email); loggableError keeps the error's kind and drops them.
    console.error(`agent action ${name} failed`, loggableError(e));
    return json({ ok: false, error: { code: "internal", message: "Something went wrong" } }, 500);
  }
}
