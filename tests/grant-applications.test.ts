import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LLMock } from "@copilotkit/aimock";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as A from "@/actions";
import { ActionError } from "@/actions/define";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import { describeAgentActions, handleRunAgentAction } from "@/lib/agent-actions";
import {
  capSource,
  copyAllText,
  DRAFT_PROMPT_LEAD,
  LOGIN_WALL_NOTE,
  looksLoginWalled,
  overLimit,
  pickDocumentLinks,
  toQuestions
} from "@/lib/grant-application";
import { draftStream, type DraftEvent } from "@/lib/grant-draft-stream";
import { PDF_MAX_PAGES } from "@/lib/grant-draft";
import { startFirecrawlMock } from "../scripts/firecrawl-dev-mock.mjs";
import { useAimockProvider } from "./aimock-provider";
import { freshDb } from "./test-db";

// The whole draft pipeline, with mocks only at its boundaries: Firecrawl's HTTP API (the
// captured OPC SB 1 page, its solicitation PDF and proposal template, and CalRecycle's GMS
// sign-in page, tests/fixtures/grant-draft/) and the model (AIMock,
// tests/fixtures/grant-draft-aimock.json). The real Firecrawl SDK and AI SDK run in between.

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, "fixtures", "grant-draft", `${name}.json`), "utf8"));
const SB1_URL = "https://www.opc.ca.gov/sb-1-funding/";
const SOLICITATION =
  "https://opc.ca.gov/wp-content/uploads/2023/12/SB1-Grant-Program-Solicitation-508.pdf";
const TEMPLATE = "https://opc.ca.gov/wp-content/uploads/2023/12/SB1-Track1-Proposal-Template.docx";

let db: Database;
let cleanup: () => void;
let llm: LLMock;
let firecrawl: Awaited<ReturnType<typeof startFirecrawlMock>>;
let restoreProvider: () => void;
const env = { ...process.env };
const ctx = () => ({ db });
let sb1Id: string;
let gmsId: string;
let noUrlId: string;

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
  llm = new LLMock({ port: 0 });
  llm.loadFixtureFile(join(__dirname, "fixtures", "grant-draft-aimock.json"));
  await llm.start();
  restoreProvider = useAimockProvider(llm.url);
  firecrawl = await startFirecrawlMock();
  process.env.FIRECRAWL_API_URL = firecrawl.url;
  process.env.FIRECRAWL_API_KEY = "fc-test";

  const [src] = await db
    .insert(t.sources)
    .values({ slug: "ca", name: "CA Grants", kind: "ca_grants", url: "https://grants.ca.gov" })
    .returning();
  const grant = (externalId: string, title: string, url: string | null) => ({
    sourceId: src.id,
    externalId,
    title,
    agency: "Ocean Protection Council",
    url,
    description: "Funding for sea level rise adaptation planning.",
    forProfitEligible: true,
    raw: {},
    firstSeenAt: new Date()
  });
  const rows = await db
    .insert(t.grants)
    .values([
      grant("sb1", "Senate Bill 1 Sea Level Rise Adaptation Grant Program – Track 1", SB1_URL),
      grant(
        "egt",
        "Empty Glass Beverage Transportation Grant Program",
        "https://secure.calrecycle.ca.gov/Grants/"
      ),
      grant("none", "A grant with no listing", null)
    ])
    .returning();
  [sb1Id, gmsId, noUrlId] = rows.map((r) => r.id);

  await db.insert(t.businessProfile).values({
    id: "main",
    name: "Cultured Matter",
    tagline: "Turning overlooked materials into culture",
    mission: "Shift how people think about waste.",
    ein: "12-3456789",
    samUei: "ABCDEFGH1234",
    sectors: ["Materials"]
  });
  await db
    .insert(t.projects)
    .values({ name: "Seaweed textiles pilot", description: "Testing kelp fiber." });
});

afterAll(async () => {
  restoreProvider();
  await llm.stop();
  await firecrawl.close();
  process.env.FIRECRAWL_API_URL = env.FIRECRAWL_API_URL;
  process.env.FIRECRAWL_API_KEY = env.FIRECRAWL_API_KEY;
  if (env.FIRECRAWL_API_URL === undefined) delete process.env.FIRECRAWL_API_URL;
  if (env.FIRECRAWL_API_KEY === undefined) delete process.env.FIRECRAWL_API_KEY;
  cleanup();
});

beforeEach(() => {
  llm.clearRequests();
  firecrawl.requests.length = 0;
});

const promptOf = (i = 0) => JSON.stringify(llm.getRequests()[i].body);

describe("reading the funder's material", () => {
  it("picks the application documents from the real SB 1 page", () => {
    const page = fixture("opc-sb1-page");
    expect(pickDocumentLinks(page.links, SB1_URL)).toEqual([SOLICITATION, TEMPLATE]);
    // Council staff reports and project lists are never picked.
    expect(
      pickDocumentLinks(
        ["/files/Item-5-SB1-Staff-Rec-508.pdf", "/x/report.pdf", "mailto:a@b.c", "/a.png"],
        SB1_URL
      )
    ).toEqual([]);
  });

  it("knows a sign-in page from a grant page", () => {
    expect(
      looksLoginWalled({ statusCode: 200, markdown: fixture("calrecycle-gms-signin").markdown })
    ).toBe(true);
    expect(looksLoginWalled({ statusCode: 200, markdown: fixture("opc-sb1-page").markdown })).toBe(
      false
    );
    expect(looksLoginWalled({ statusCode: 403, markdown: "Forbidden" })).toBe(true);
  });

  it("caps a long PDF without losing its questions", () => {
    const pdf = fixture("opc-sb1-solicitation-pdf").markdown as string;
    expect(pdf.length).toBeGreaterThan(30_000);
    const capped = capSource(pdf, 8_000);
    expect(capped.length).toBeLessThanOrEqual(8_000);
    expect(capped).toContain("OPC SB 1 Grant Program Solicitation");
    expect(capped).toMatch(/Applicants are asked to describe community readiness/);
  });
});

describe("drafting from the grant's listing", () => {
  it("reads the page and its PDF, makes one model call, and saves one answer per question", async () => {
    const result = await A.draftGrantApplication.run({ grantId: sb1Id }, ctx());

    // Firecrawl: the page (markdown and links, PDF parser capped), then the two documents.
    const scrapes = firecrawl.requests.filter((r) => r.path === "/v2/scrape");
    expect(scrapes.map((r) => r.url)).toEqual([SB1_URL, SOLICITATION, TEMPLATE]);
    expect(scrapes[0].options).toMatchObject({
      formats: ["markdown", "links"],
      parsers: [{ type: "pdf", maxPages: PDF_MAX_PAGES }]
    });
    expect(scrapes[1].options).toMatchObject({
      parsers: [{ type: "pdf", maxPages: PDF_MAX_PAGES }]
    });

    // One model call, carrying the page, the PDF and the template; never the EIN or SAM UEI.
    expect(llm.getRequests()).toHaveLength(1);
    const prompt = promptOf();
    expect(prompt).toContain(DRAFT_PROMPT_LEAD);
    expect(prompt).toContain("As of September 2026, $32.9 million is available");
    expect(prompt).toContain("Relative Need for SLR Planning");
    expect(prompt).toContain("The maximum word count for the Summary is 200 words");
    expect(prompt).toContain("Seaweed textiles pilot");
    expect(prompt).not.toContain("12-3456789");
    expect(prompt).not.toContain("ABCDEFGH1234");
    expect(prompt.length).toBeLessThan(60_000);

    const app = result.application;
    expect(app.status).toBe("drafted");
    expect(result.page).toBe(`/grants/${sb1Id}`);
    expect(app.questions).toHaveLength(9);
    expect(app.questions.every((q) => q.answer.trim().length > 0)).toBe(true);
    expect(new Set(app.questions.map((q) => q.id)).size).toBe(9);
    expect(app.questions[2]).toMatchObject({ limit: "200 words", maxWords: 200 });
    expect(app.sources).toEqual([
      expect.objectContaining({ kind: "page", url: SB1_URL, read: true }),
      expect.objectContaining({ kind: "document", url: SOLICITATION, read: true }),
      expect.objectContaining({ kind: "document", url: TEMPLATE, read: true })
    ]);

    const [log] = await db
      .select()
      .from(t.activityLog)
      .where(eq(t.activityLog.action, "draftGrantApplication"));
    expect(log.summary).toBe(
      "Drafted 9 answers for Senate Bill 1 Sea Level Rise Adaptation Grant Program – Track 1"
    );
  });

  it("saves her edits and reads them back", async () => {
    const before = await A.getGrantApplication.run({ grantId: sb1Id }, ctx());
    const q = before.application!.questions[2];
    const edited = await A.updateGrantApplication.run(
      { grantId: sb1Id, answers: [{ id: q.id, answer: "My own summary.\r\nSecond line." }] },
      ctx()
    );
    expect(edited.changed).toBe(1);
    const after = await A.getGrantApplication.run({ grantId: sb1Id }, ctx());
    expect(after.grant.title).toMatch(/^Senate Bill 1/);
    expect(after.application!.status).toBe("edited");
    expect(after.application!.questions[2].answer).toBe("My own summary.\nSecond line.");
    expect(after.application!.questions[3].answer).toBe(before.application!.questions[3].answer);

    await expect(
      A.updateGrantApplication.run({ grantId: sb1Id, answers: [{ id: "q99", answer: "x" }] }, ctx())
    ).rejects.toThrow(ActionError);
  });
});

describe("the fallback when the questions can't be read", () => {
  it("stops at a sign-in page without spending an AI call", async () => {
    const result = await A.draftGrantApplication.run({ grantId: gmsId }, ctx());
    expect(firecrawl.requests).toHaveLength(1);
    expect(llm.getRequests()).toHaveLength(0);
    expect(result.application).toMatchObject({
      status: "needs_questions",
      questions: [],
      note: LOGIN_WALL_NOTE
    });
  });

  it("drafts from questions she pastes, without reading the web", async () => {
    const result = await A.draftGrantApplication.run(
      {
        grantId: gmsId,
        questions:
          "1. Describe your business and the problem it solves. (150 words)\n2. How will you use the funds? (1,000 characters)"
      },
      ctx()
    );
    expect(firecrawl.requests).toHaveLength(0);
    expect(llm.getRequests()).toHaveLength(1);
    expect(promptOf()).toContain("How will you use the funds?");
    expect(result.application.status).toBe("drafted");
    expect(result.application.note).toBeNull();
    expect(result.application.questions.map((q) => q.limit)).toEqual([
      "150 words",
      "1,000 characters"
    ]);
    expect(result.application.sources).toEqual([
      { kind: "pasted", url: null, title: "Questions you pasted", read: true }
    ]);
  });

  it("drafts from an uploaded PDF through the streaming route, step by step", async () => {
    const form = new FormData();
    form.set(
      "file",
      new File(
        [Buffer.from("%PDF-1.7\n% SB1 proposal template\n")],
        "SB1-Track1-Proposal-Template.pdf",
        {
          type: "application/pdf"
        }
      )
    );
    const res = draftStream(
      new Request("http://app/api", { method: "POST", body: form }),
      noUrlId,
      { db } as never
    );
    const events = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as DraftEvent);
    expect(events).toEqual([
      { type: "step", step: "reading_upload" },
      { type: "step", step: "drafting" },
      { type: "done", status: "drafted" }
    ]);
    const [parse] = firecrawl.requests;
    expect(parse).toMatchObject({
      path: "/v2/parse",
      filename: "SB1-Track1-Proposal-Template.pdf",
      options: expect.objectContaining({
        parsers: [expect.objectContaining({ type: "pdf", maxPages: PDF_MAX_PAGES })]
      })
    });
    expect(promptOf()).toContain("The maximum word count for the Summary is 200 words");
    const saved = await A.getGrantApplication.run({ grantId: noUrlId }, ctx());
    expect(saved.application!.questions).toHaveLength(9);
    expect(saved.application!.sources[0]).toMatchObject({ kind: "upload", read: true });
  });

  it("keeps her answers when a later read hits a sign-in", async () => {
    // gmsId has the pasted draft; its listing is the sign-in page.
    const result = await A.draftGrantApplication.run({ grantId: gmsId }, ctx());
    expect(result.application.questions).toHaveLength(2);
    expect(result.application.status).toBe("drafted");
    expect(result.application.note).toBe(LOGIN_WALL_NOTE);
  });

  it("asks for the questions when a grant has no listing link", async () => {
    const [src] = await db.select().from(t.sources);
    const [g] = await db
      .insert(t.grants)
      .values({
        sourceId: src.id,
        externalId: "x",
        title: "No link",
        raw: {},
        firstSeenAt: new Date()
      })
      .returning();
    const result = await A.draftGrantApplication.run({ grantId: g.id }, ctx());
    expect(result.application.status).toBe("needs_questions");
    expect(firecrawl.requests).toHaveLength(0);
    expect(llm.getRequests()).toHaveLength(0);
  });

  it("reports a Firecrawl outage and saves nothing", async () => {
    process.env.FIRECRAWL_API_URL = "http://127.0.0.1:9";
    try {
      const [src] = await db.select().from(t.sources);
      const [g] = await db
        .insert(t.grants)
        .values({
          sourceId: src.id,
          externalId: "y",
          title: "Down",
          url: SB1_URL,
          raw: {},
          firstSeenAt: new Date()
        })
        .returning();
      await expect(A.draftGrantApplication.run({ grantId: g.id }, ctx())).rejects.toMatchObject({
        code: "unavailable"
      });
      expect((await A.getGrantApplication.run({ grantId: g.id }, ctx())).application).toBeNull();
    } finally {
      process.env.FIRECRAWL_API_URL = firecrawl.url;
    }
  });
});

describe("the assistant's tools", () => {
  it("offers the reads and the writes, and the writes need her approval", () => {
    const actions = describeAgentActions();
    const kind = (name: string) => actions.find((a) => a.name === name)?.kind;
    expect(kind("getGrantApplication")).toBe("read");
    expect(kind("draftGrantApplication")).toBe("write");
    expect(kind("updateGrantApplication")).toBe("write");
  });

  it("runs getGrantApplication over the agent endpoint", async () => {
    process.env.AGENT_SERVICE_TOKEN = "agent-secret";
    try {
      const res = await handleRunAgentAction(
        new Request("http://app/api/agent/actions/getGrantApplication", {
          method: "POST",
          headers: { authorization: "Bearer agent-secret" },
          body: JSON.stringify({ grantId: sb1Id })
        }),
        "getGrantApplication",
        { db }
      );
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.page).toBe(`/grants/${sb1Id}`);
      expect(body.data.application.questions).toHaveLength(9);
    } finally {
      process.env.AGENT_SERVICE_TOKEN = env.AGENT_SERVICE_TOKEN;
      if (env.AGENT_SERVICE_TOKEN === undefined) delete process.env.AGENT_SERVICE_TOKEN;
    }
  });
});

describe("copying and limits", () => {
  it("copies every question with its answer", () => {
    expect(
      copyAllText("Grant X", [
        { question: "Summary", limit: "200 words", answer: " Hello " },
        { question: "Name", limit: null, answer: "CM" }
      ])
    ).toBe("Grant X: draft application\n\n\n1. Summary (200 words)\n\nHello\n\n\n2. Name\n\nCM");
  });

  it("flags answers over the limit and tidies the model's questions", () => {
    expect(overLimit({ maxWords: 3, maxChars: null }, "one two three four")).toBe(true);
    expect(overLimit({ maxWords: null, maxChars: 5 }, "12345")).toBe(false);
    const qs = toQuestions({
      questionsFound: true,
      reason: null,
      questions: [
        { question: " Summary ", limit: "", maxWords: 0, maxChars: null, answer: "a" },
        { question: "summary", limit: null, maxWords: null, maxChars: null, answer: "dup" },
        { question: "  ", limit: null, maxWords: null, maxChars: null, answer: "blank" }
      ]
    });
    expect(qs).toEqual([
      { id: "q1", question: "Summary", limit: null, maxWords: null, maxChars: null, answer: "a" }
    ]);
  });
});
