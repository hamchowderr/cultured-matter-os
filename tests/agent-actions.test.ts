import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Database } from "@/db";
import {
  describeAgentActions,
  handleListAgentActions,
  handleRunAgentAction
} from "@/lib/agent-actions";
import { freshDb } from "./test-db";

// The proxy matcher test only reads proxy.ts's config; skip loading Better Auth behind it.
vi.mock("@/lib/auth", () => ({ auth: {} }));

let db: Database;
let cleanup: () => void;
const KEY = "test-agent-service-token-0123456789";
const auth = { authorization: `Bearer ${KEY}` };

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
  process.env.AGENT_SERVICE_TOKEN = KEY;
});
afterAll(() => {
  delete process.env.AGENT_SERVICE_TOKEN;
  cleanup();
});

const list = (headers: Record<string, string> = {}) =>
  handleListAgentActions(new Request("http://localhost/api/agent/actions", { headers }));

const run = (name: string, body: unknown, headers: Record<string, string> = auth) =>
  handleRunAgentAction(
    new Request(`http://localhost/api/agent/actions/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body)
    }),
    name,
    { db }
  );

describe("agent action list", () => {
  it("refuses a missing or wrong token", async () => {
    expect((await list()).status).toBe(401);
    expect((await list({ authorization: "Bearer nope" })).status).toBe(401);
  });

  it("is closed when no token is configured", async () => {
    delete process.env.AGENT_SERVICE_TOKEN;
    expect((await list(auth)).status).toBe(401);
    process.env.AGENT_SERVICE_TOKEN = KEY;
  });

  it("lists each action with its kind and a JSON Schema of its input", async () => {
    const res = await list(auth);
    expect(res.status).toBe(200);
    const { actions } = await res.json();
    const byName = new Map(actions.map((a: { name: string }) => [a.name, a]));
    expect(byName.get("searchCompanies")).toMatchObject({ kind: "read" });
    const createTask = byName.get("createTask") as { kind: string; inputSchema: any };
    expect(createTask.kind).toBe("write");
    expect(createTask.inputSchema.type).toBe("object");
    expect(createTask.inputSchema.required).toEqual(["title"]);
    expect(createTask.inputSchema.properties.dueDate).toMatchObject({
      type: "string",
      format: "date-time"
    });
  });

  it("never offers the approval queue, email or settings actions", () => {
    const names = describeAgentActions().map((a) => a.name);
    for (const hidden of [
      "requestApproval",
      "decideApproval",
      "draftFollowUp",
      "setNewsletter",
      "setDailyEmail",
      "getUserSettings",
      "resetCalendarLink"
    ]) {
      expect(names).not.toContain(hidden);
    }
  });
});

describe("running an agent action", () => {
  it("refuses a wrong token", async () => {
    expect((await run("listTasks", {}, { authorization: "Bearer nope" })).status).toBe(401);
  });

  it("runs a write and then reads it back", async () => {
    const created = await run("createTask", { title: "Call the lab", dueDate: "2026-10-09" });
    expect(created.status).toBe(200);
    const body = await created.json();
    expect(body).toMatchObject({ ok: true, data: { title: "Call the lab" } });

    const read = await (await run("listTasks", {})).json();
    expect(read.ok).toBe(true);
    expect(read.data.tasks.map((t: { title: string }) => t.title)).toContain("Call the lab");
  });

  it("rejects bad input with the first validation message", async () => {
    const res = await run("createTask", { title: "" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid");
    expect((await run("createTask", "not json")).status).toBe(400);
  });

  it("does not run unknown or excluded actions", async () => {
    expect((await run("nope", {})).status).toBe(404);
    expect((await run("decideApproval", { id: "x", decision: "approved" })).status).toBe(404);
  });
});

describe("proxy matcher", () => {
  it("leaves the agent action endpoints public and the chat proxy behind sign-in", async () => {
    const { config } = await import("@/proxy");
    const re = new RegExp(`^${config.matcher[0]}$`);
    expect(re.test("/api/agent/actions")).toBe(false);
    expect(re.test("/api/agent/actions/createTask")).toBe(false);
    expect(re.test("/api/agent-controller/stream")).toBe(true);
    expect(re.test("/api/agent-controller/threads")).toBe(true);
    expect(re.test("/api/workspace/files")).toBe(true);
  });
});
