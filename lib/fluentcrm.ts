// A small client for FluentCRM's REST API (https://developers.fluentcrm.com/rest-api/).
// Base path: {FLUENTCRM_URL}/wp-json/fluent-crm/v2, Basic auth with a WordPress application
// password. Only the three calls the newsletter sync needs.

export type FluentConfig = {
  baseUrl: string;
  user: string;
  appPassword: string;
  listId: number;
};

export type FluentSubscriber = {
  id: number;
  email: string;
  status: string;
};

type Env = Record<string, string | undefined>;

// Infisical holds placeholders until her install exists; treat those as "not connected".
const PLACEHOLDER = /^(your[_-]|changeme|placeholder|todo|xxx)|_here$/i;

function real(value: string | undefined) {
  const v = value?.trim();
  return v && !PLACEHOLDER.test(v) ? v : null;
}

// The FluentCRM settings, or null when any of them is missing or still a placeholder.
export function fluentConfig(env: Env = process.env): FluentConfig | null {
  const url = real(env.FLUENTCRM_URL);
  const user = real(env.FLUENTCRM_USER);
  const appPassword = real(env.FLUENTCRM_APP_PASSWORD);
  const listId = Number(real(env.FLUENTCRM_LIST_ID));
  if (!url || !user || !appPassword || !Number.isInteger(listId) || listId <= 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // Basic auth over plain HTTP would expose the password; WordPress refuses it too.
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") return null;
  const site = parsed.href.replace(/\/+$/, "");
  return { baseUrl: `${site}/wp-json/fluent-crm/v2`, user, appPassword, listId };
}

export class FluentError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "FluentError";
  }
}

// Statuses FluentCRM will not email; a sync must never flip these back to subscribed.
export const BLOCKED_STATUSES = new Set(["unsubscribed", "bounced", "complained", "spammed"]);

export function fluentClient(config: FluentConfig, fetchImpl: typeof fetch = fetch) {
  const auth = `Basic ${Buffer.from(`${config.user}:${config.appPassword}`).toString("base64")}`;

  async function call(method: string, path: string, body?: unknown) {
    const res = await fetchImpl(`${config.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: auth,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store"
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      // Never echo the request (it carries the credentials); the status code is enough.
      const hint =
        res.status === 401 || res.status === 403
          ? "FluentCRM refused the login (check the user and application password)"
          : `FluentCRM answered ${res.status}`;
      throw new FluentError(res.status, hint);
    }
    return (await res.json()) as Record<string, unknown>;
  }

  return {
    listId: config.listId,

    // GET /subscribers/0?get_by_email= — 404 when there is no such contact.
    async findByEmail(email: string): Promise<FluentSubscriber | null> {
      const data = await call("GET", `/subscribers/0?get_by_email=${encodeURIComponent(email)}`);
      const s = data?.subscriber as FluentSubscriber | undefined;
      return s?.id ? { id: Number(s.id), email: s.email, status: s.status } : null;
    },

    // POST /subscribers — a new contact, subscribed and on the list.
    async create(input: { email: string; firstName?: string | null; lastName?: string | null }) {
      const data = await call("POST", "/subscribers", {
        email: input.email,
        first_name: input.firstName ?? undefined,
        last_name: input.lastName ?? undefined,
        status: "subscribed",
        lists: [config.listId]
      });
      const c = data?.contact as FluentSubscriber | undefined;
      if (!c?.id) throw new FluentError(500, "FluentCRM did not return the new contact");
      return { id: Number(c.id), email: c.email, status: c.status } satisfies FluentSubscriber;
    },

    // PUT /subscribers/{id} — add to the list; the contact's status is left alone.
    async attachList(id: number) {
      await call("PUT", `/subscribers/${id}`, { subscriber: { attach_lists: [config.listId] } });
    },

    // PUT /subscribers/{id} — take off the list (she turned the flag off in the app).
    async detachList(id: number) {
      await call("PUT", `/subscribers/${id}`, { subscriber: { detach_lists: [config.listId] } });
    }
  };
}

export type FluentClient = ReturnType<typeof fluentClient>;
