import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { LLMock } from "@copilotkit/aimock";
import { LibSQLStore } from "@mastra/libsql";
import type { Memory } from "@mastra/memory";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as A from "@/actions";
import { CHAT_APPROVAL_ACTIONS, CHAT_READ_ACTIONS } from "@/actions/chat";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import { createChatAgent, createChatMemory } from "@/lib/chat/agent";
import { CHAT_MAX_STEPS, CHAT_MODEL, chatModel } from "@/lib/chat/config";
import { pageContextMessage, recordFromUrl } from "@/lib/chat/page-context";
import {
  ChatNotFound,
  listThreads,
  streamChat,
  threadMessages,
  titleFrom
} from "@/lib/chat/server";
import { chatTools, proposeToolName } from "@/lib/chat/tools";
import { CHAT_SEED, seedChatData } from "./fixtures/chat-seed";
import { freshDb } from "./test-db";

// Every model call here goes to AIMock with the fixtures in tests/fixtures/chat-aimock.json.
// No gateway key is read and nothing is billed.

const USER = "user_simone";
let db: Database;
let cleanup: () => void;
let mock: LLMock;
let memory: Memory;
let storeDir: string;

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
  await seedChatData(db);
  mock = new LLMock({ port: 0 });
  mock.loadFixtureFile(join(__dirname, "fixtures", "chat-aimock.json"));
  await mock.start();
  process.env.USE_AIMOCK = "true";
  process.env.AIMOCK_URL = mock.url;
  storeDir = mkdtempSync(join(tmpdir(), "cmos-chat-"));
  const store = new LibSQLStore({
    id: "chat-test",
    url: pathToFileURL(join(storeDir, "mastra.db")).href
  });
  memory = createChatMemory(store);
});

afterAll(async () => {
  await mock.stop();
  delete process.env.USE_AIMOCK;
  delete process.env.AIMOCK_URL;
  cleanup();
  try {
    rmSync(storeDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {}
});

type Chunk = { type: string; [key: string]: unknown };

async function send(
  threadId: string,
  text: string,
  page?: Parameters<typeof pageContextMessage>[0],
  userId = USER
) {
  const agent = createChatAgent({ db, memory });
  const stream = await streamChat({
    agent,
    userId,
    request: {
      threadId,
      message: { id: `m_${Math.random()}`, role: "user", parts: [{ type: "text", text }] },
      page
    }
  });
  const chunks: Chunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Chunk);
  }
  const text_ = chunks
    .filter((c) => c.type === "text-delta")
    .map((c) => c.delta)
    .join("");
  const outputs = chunks.filter((c) => c.type === "tool-output-available");
  const calls = chunks.filter((c) => c.type === "tool-input-available");
  return { chunks, text: text_, outputs, calls };
}

describe("chat config", () => {
  it("names one gateway model and lifts the 5-step default", () => {
    expect(CHAT_MODEL).toMatch(/^vercel\/anthropic\/claude-sonnet-/);
    expect(CHAT_MAX_STEPS).toBeGreaterThan(5);
  });

  it("routes to AIMock, never the gateway, when USE_AIMOCK is on", () => {
    expect(chatModel()).toEqual(expect.objectContaining({ url: `${mock.url}/v1`, apiKey: "mock" }));
  });
});

describe("chat tools", () => {
  const tools = chatTools();

  it("wraps the read actions directly and every write as a propose tool", () => {
    for (const a of CHAT_READ_ACTIONS) {
      expect(a.kind).toBe("read");
      expect(tools[a.name]).toBeDefined();
    }
    for (const a of CHAT_APPROVAL_ACTIONS) {
      expect(a.kind).toBe("write");
      // A write the approval runs inside its own transaction can't have a network step.
      expect(a.prepare).toBeUndefined();
      expect(tools[a.name]).toBeUndefined();
      expect(tools[proposeToolName(a.name)]).toBeDefined();
    }
  });

  it("never offers the approval decision, or anything that sends", () => {
    const names = Object.keys(tools);
    for (const banned of ["decideApproval", "requestApproval", "draftFollowUp", "setNewsletter"]) {
      expect(names).not.toContain(banned);
    }
    expect(names.filter((n) => !n.startsWith("propose"))).toEqual(
      CHAT_READ_ACTIONS.map((a) => a.name)
    );
  });

  it("covers the reads the brief names", () => {
    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining([
        "searchCompanies",
        "searchGrants",
        "searchContacts",
        "findWarmPath",
        "contactWarmPaths",
        "listNotifications",
        "searchNotes",
        "listTasks",
        "listProjects"
      ])
    );
  });
});

describe("chat cards", () => {
  it("turns JSON dates back into Dates for the cards, and leaves Dates alone", async () => {
    const { reviveDates } = await import("@/components/chat/chat-tool-part");
    const d = new Date("2026-10-04T12:00:00.000Z");
    const out = reviveDates({
      approval: { createdAt: d.toISOString(), decidedAt: d, summary: d.toISOString() },
      grants: [{ deadline: d.toISOString(), title: "x" }]
    });
    expect(out.approval.createdAt).toBeInstanceOf(Date);
    expect(out.approval.decidedAt).toBe(d);
    expect(out.approval.summary).toBe(d.toISOString());
    expect(out.grants[0].deadline).toBeInstanceOf(Date);
  });
});

describe("page context", () => {
  it("tells the agent the page and the open record", () => {
    const msg = pageContextMessage({
      path: "/radar",
      record: { type: "company", id: "co_1", label: "Soliome" }
    });
    expect(msg).toContain("Radar page");
    expect(msg).toContain('"Soliome", id co_1');
    expect(pageContextMessage({ path: "/today" })).toBe("Simone is on the Today page (/today).");
  });

  it("reads a record named in the URL", () => {
    expect(recordFromUrl("/radar", new URLSearchParams("company=co_9"))).toEqual({
      type: "company",
      id: "co_9"
    });
    expect(recordFromUrl("/projects", new URLSearchParams("p=pr_1"))?.type).toBe("project");
    expect(recordFromUrl("/today", new URLSearchParams("company=co_9"))).toBeNull();
  });

  it("titles a thread from her first message", () => {
    expect(titleFrom("  Which grants   close soon? ")).toBe("Which grants close soon?");
    expect(titleFrom("x".repeat(100))).toHaveLength(58);
  });
});

describe("a conversation (AIMock)", () => {
  it("answers a question from a tool, and keeps the thread for this user only", async () => {
    const { text, outputs, calls } = await send("th_radar", "What is on Radar about sunscreen?", {
      path: "/radar"
    });
    expect(calls.map((c) => c.toolName)).toEqual(["searchCompanies"]);
    const out = outputs[0].output as { companies: { id: string; name: string }[] };
    expect(out.companies.map((c) => c.name)).toEqual(["Soliome"]);
    expect(text).toContain("Soliome");

    const threads = await listThreads(memory, USER);
    expect(threads.map((th) => th.id)).toContain("th_radar");
    expect(threads.find((th) => th.id === "th_radar")?.title).toBe(
      "What is on Radar about sunscreen?"
    );
    // The full screen reopens it with the tool result, so the card renders again.
    const messages = await threadMessages(memory, USER, "th_radar");
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(JSON.stringify(messages[1].parts)).toContain("tool-searchCompanies");

    // Someone else can't see or continue it.
    expect(await listThreads(memory, "someone_else")).toEqual([]);
    await expect(threadMessages(memory, "someone_else", "th_radar")).rejects.toThrow(ChatNotFound);
    await expect(send("th_radar", "hello", undefined, "someone_else")).rejects.toThrow(
      ChatNotFound
    );
  });

  it("sends the page and record to the model", async () => {
    await send("th_page", "Who can introduce me to this company?", {
      path: "/radar",
      record: { type: "company", id: CHAT_SEED.companyId, label: "Soliome" }
    });
    const last = mock.getRequests().at(-1);
    expect(JSON.stringify(last?.body)).toContain("She has this company open");
  });

  it("proposes a change as an approval, and only Approve carries it out", async () => {
    const { outputs, text } = await send("th_write", "Shortlist this company", {
      path: "/radar",
      record: { type: "company", id: CHAT_SEED.companyId, label: "Soliome" }
    });
    const { approval } = outputs[0].output as { approval: { id: string; status: string } };
    expect(approval.status).toBe("pending");
    expect(text).toContain("Approve");

    const company = async () =>
      (await db.select().from(t.companies).where(eq(t.companies.id, CHAT_SEED.companyId)))[0];
    expect((await company()).status).toBe("new");

    const decided = await A.decideApproval.run(
      { approvalId: approval.id, decision: "approve" },
      { db }
    );
    expect(decided.status).toBe("approved");
    expect(decided.result).toEqual(expect.objectContaining({ status: "shortlisted" }));
    expect((await company()).status).toBe("shortlisted");
    expect((await company()).statusNote).toBe("Fits the beauty pairing");
    const log = await db
      .select()
      .from(t.activityLog)
      .where(eq(t.activityLog.action, "shortlistCompany"));
    expect(log).toHaveLength(1);
  });

  it("a rejected proposal changes nothing", async () => {
    const { outputs } = await send("th_reject", "Shortlist this company");
    const { approval } = outputs[0].output as { approval: { id: string } };
    await db
      .update(t.companies)
      .set({ status: "new" })
      .where(eq(t.companies.id, CHAT_SEED.companyId));
    await A.decideApproval.run({ approvalId: approval.id, decision: "reject" }, { db });
    const [row] = await db
      .select()
      .from(t.companies)
      .where(eq(t.companies.id, CHAT_SEED.companyId));
    expect(row.status).toBe("new");
  });

  it("finds warm paths and contacts for the inline cards", async () => {
    const warm = await send("th_warm", "Who can introduce me to this company?");
    const paths = (warm.outputs[0].output as { paths: { contact: { fullName: string } }[] }).paths;
    expect(paths.map((p) => p.contact.fullName)).toEqual(["Jordan Rivera"]);

    const contacts = await send("th_contacts", "Find Jordan in my contacts");
    expect(
      (contacts.outputs[0].output as { contacts: { id: string }[] }).contacts.map((c) => c.id)
    ).toEqual([CHAT_SEED.contactId]);

    const grants = await send("th_grants", "Which grants close soon?");
    expect(
      (grants.outputs[0].output as { grants: { id: string }[] }).grants.map((g) => g.id)
    ).toEqual([CHAT_SEED.grantId]);
  });
});
