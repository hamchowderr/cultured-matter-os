import { desc, eq } from "drizzle-orm";

import { ActionError } from "@/actions/define";
import type { Executor } from "@/db";
import { accounts, users } from "@/db/schema";
import { GRAPH_SCOPES } from "@/lib/graph-scopes";

// Microsoft Graph v1.0 over plain fetch. Delegated permissions, granted on the Microsoft
// sign-in (lib/auth.ts) or later through "Connect Outlook" (authClient.linkSocial).
export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
export { GRAPH_SCOPES };

export function outlookNotConnected() {
  return new ActionError(
    "outlook_not_connected",
    "Outlook isn't connected yet. Use Connect Outlook on the People page."
  );
}

// Stored scopes are comma or space separated and may carry the Graph resource prefix.
export function missingGraphScopes(scope: string | null | undefined): string[] {
  const granted = new Set(
    (scope ?? "")
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((s) => s.split("/").pop()!.toLowerCase())
  );
  return GRAPH_SCOPES.filter((s) => !granted.has(s.toLowerCase()));
}

// The Microsoft account behind the app. Single-user app: the most recently used one.
export async function microsoftAccount(db: Executor) {
  const [row] = await db
    .select({ account: accounts, email: users.email })
    .from(accounts)
    .innerJoin(users, eq(accounts.userId, users.id))
    .where(eq(accounts.providerId, "microsoft"))
    .orderBy(desc(accounts.updatedAt))
    .limit(1);
  return row ?? null;
}

// `me` holds the mailbox owner's addresses, to tell her own messages from other people's.
export type GraphSession = { token: string; me: Set<string> };

// A valid access token (Better Auth refreshes it when it is about to expire) and her addresses.
export async function graphSession(db: Executor): Promise<GraphSession> {
  const row = await microsoftAccount(db);
  if (!row || missingGraphScopes(row.account.scope).length) throw outlookNotConnected();
  const { auth } = await import("@/lib/auth");
  let token: string | undefined;
  try {
    ({ accessToken: token } = await auth.api.getAccessToken({
      body: { accountId: row.account.id, userId: row.account.userId }
    }));
  } catch {
    // Refresh token revoked or expired: connecting Outlook again fixes it.
    throw outlookNotConnected();
  }
  if (!token) throw outlookNotConnected();
  const session: GraphSession = { token, me: new Set([row.email.toLowerCase()]) };
  // The mailbox address can differ from the sign-in address (aliases, work accounts).
  const profile = await graph<{ mail?: string | null; userPrincipalName?: string | null }>(
    session,
    "/me?$select=mail,userPrincipalName"
  );
  for (const a of [profile.mail, profile.userPrincipalName]) {
    if (a?.includes("@")) session.me.add(a.toLowerCase());
  }
  return session;
}

export async function graph<T>(
  session: GraphSession,
  pathOrUrl: string,
  init?: { method?: "GET" | "POST"; body?: unknown }
): Promise<T> {
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${GRAPH_BASE}${pathOrUrl}`;
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${session.token}`,
      // Message ids that survive moving between folders, so the email log never duplicates.
      Prefer: 'IdType="ImmutableId"',
      ...(init?.body ? { "Content-Type": "application/json" } : {})
    },
    body: init?.body ? JSON.stringify(init.body) : undefined
  });
  if (res.status === 401 || res.status === 403) throw outlookNotConnected();
  if (!res.ok) {
    throw new ActionError(
      "unavailable",
      `Outlook didn't respond (error ${res.status}). Try again.`
    );
  }
  return (await res.json()) as T;
}

// Follows @odata.nextLink until `max` items or the last page.
export async function graphAll<T>(session: GraphSession, path: string, max: number) {
  const items: T[] = [];
  let next: string | undefined = path;
  while (next && items.length < max) {
    const page: { value: T[]; "@odata.nextLink"?: string } = await graph(session, next);
    items.push(...page.value);
    next = page["@odata.nextLink"];
  }
  return items.slice(0, max);
}

// Query strings keep the literal `$` OData expects; values are encoded.
export function odata(path: string, params: Record<string, string | number>) {
  const qs = Object.entries(params)
    .map(([k, v]) => `$${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return `${path}?${qs}`;
}

// OData string literal: single quotes are doubled.
export const odataString = (v: string) => `'${v.replace(/'/g, "''")}'`;
