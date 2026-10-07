import Firecrawl, {
  type Document,
  type ParseOptions,
  type ScrapeOptions
} from "@mendable/firecrawl-js";
import { generateText, Output } from "ai";

import { ActionError } from "@/actions/define";
import type { ProfileFields } from "@/lib/business-profile";
import {
  buildDraftPrompt,
  draftOutputSchema,
  FALLBACK_ASK,
  fileNameOf,
  LOGIN_WALL_NOTE,
  looksLoginWalled,
  NO_PAGE_NOTE,
  NO_QUESTIONS_NOTE,
  pickDocumentLinks,
  toQuestions,
  type DraftContext,
  type DraftSourceText,
  type DraftStep,
  type GrantQuestion,
  type GrantSource
} from "@/lib/grant-application";

// The drafting pipeline behind "Draft application" (the grant's page) and the assistant's
// draftGrantApplication: Firecrawl reads the funder's page and up to two linked documents
// (PDF or Word), then ONE model call through the AI Gateway finds the questions and drafts
// every answer. When she pastes the questions or uploads the PDF, Firecrawl reads only the
// upload (or nothing, for a paste).
//
// Firecrawl: the app's own client (as the Radar monitors use, ingest/monitors/firecrawl.ts),
// FIRECRAWL_API_KEY from Infisical. FIRECRAWL_API_URL, which the SDK reads itself, points
// tests and the local dev loop at a mock (scripts/firecrawl-dev-mock.mjs). A page is 1 credit;
// a PDF is 1 credit a page, capped at PDF_MAX_PAGES per document, so one draft is at most
// 1 + 2 × 15 = 31 credits.
//
// The model: the voice guide's (lib/voice-ai.ts), a plain gateway id that AIMock replaces in
// tests and the dev loop. Input is capped (lib/grant-application.ts: about 14,000 tokens at
// most) and output at DRAFT_MAX_OUTPUT_TOKENS: Claude Haiku 4.5 at $1 in and $5 out per million
// tokens makes one draft about 4 cents at most.
export const DRAFT_MODEL = "anthropic/claude-haiku-4.5";
export const DRAFT_MAX_OUTPUT_TOKENS = 4_000;
export const PDF_MAX_PAGES = 15;
// The largest PDF she can upload (a Vercel function takes a 4.5 MB body).
export const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

const PAGE_TIMEOUT_MS = 60_000;
const DOCUMENT_TIMEOUT_MS = 90_000;
// Reuse Firecrawl's cached copy of a page up to a day old.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type Scrape = (url: string, options: ScrapeOptions) => Promise<Document>;
export type ParseUpload = (
  file: { data: Uint8Array; filename: string; contentType: string },
  options: ParseOptions
) => Promise<Document>;
export type FirecrawlClient = { scrape: Scrape; parse: ParseUpload };
export type OnStep = (step: DraftStep) => void;

const PDF_PARSER = { type: "pdf" as const, mode: "auto" as const, maxPages: PDF_MAX_PAGES };

export const PAGE_OPTIONS: ScrapeOptions = {
  formats: ["markdown", "links"],
  onlyMainContent: true,
  parsers: [PDF_PARSER],
  maxAge: MAX_AGE_MS,
  timeout: PAGE_TIMEOUT_MS
};
export const DOCUMENT_OPTIONS: ScrapeOptions = {
  formats: ["markdown"],
  parsers: [PDF_PARSER],
  maxAge: MAX_AGE_MS,
  timeout: DOCUMENT_TIMEOUT_MS
};
export const UPLOAD_OPTIONS: ParseOptions = { formats: ["markdown"], parsers: [PDF_PARSER] };

// The live client, or null when FIRECRAWL_API_KEY is unset (pasting still works then).
// maxRetries counts attempts in this SDK.
export function firecrawlClient(apiKey = process.env.FIRECRAWL_API_KEY): FirecrawlClient | null {
  if (!apiKey) return null;
  const client = new Firecrawl({ apiKey, maxRetries: 2 });
  return {
    scrape: (url, options) => client.scrape(url, options),
    parse: (file, options) =>
      client.parse(
        { data: file.data, filename: file.filename, contentType: file.contentType },
        options
      )
  };
}

const READ_FAILED =
  "Reading the funder’s page didn’t work just now. Try again in a minute, or paste the questions.";

// ------------------------------------------------------------------ Her context

const yesNo = (v: boolean | null) => (v == null ? null : v ? "yes" : "no");

// Her profile as the model reads it. The EIN and SAM UEI are never sent.
export function profileText(p: Partial<ProfileFields>) {
  const lines: [string, string | null | undefined][] = [
    ["Business", p.name],
    ["Tagline", p.tagline],
    ["Mission", p.mission],
    ["Story", p.story],
    ["Founder", p.founderName],
    ["Founder bio", p.founderBio],
    ["Legal entity", [p.entityType, p.entityState].filter(Boolean).join(", ") || null],
    ["Address", p.address],
    ["Founded", p.foundedOn],
    ["Team size", p.teamSize],
    ["Revenue stage", p.revenueStage],
    ["Woman-owned", yesNo(p.womanOwned ?? null)],
    ["Minority-owned", yesNo(p.minorityOwned ?? null)],
    ["Sectors", p.sectors?.join(", ")],
    ["Fit criteria", p.fitCriteria?.join("; ")],
    ["Target brands", p.targetBrands?.join(", ")],
    ["Key people", p.people?.map((x) => (x.role ? `${x.name} (${x.role})` : x.name)).join("; ")],
    ["Website", p.website],
    ["Notes", p.notes]
  ];
  return lines
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${String(v).trim()}`)
    .join("\n");
}

// ------------------------------------------------------------------ Reading the funder

export type Gathered = {
  texts: DraftSourceText[];
  sources: GrantSource[];
  // Set when nothing worth drafting from was read: the page shows it with the fallback.
  note: string | null;
};

const markdownOf = (doc: Document) => (doc.markdown ?? "").trim();
const titleOf = (doc: Document, fallback: string) =>
  (typeof doc.metadata?.title === "string" && doc.metadata.title.trim()) || fallback;

/** The funder's page and its best linked documents, read through Firecrawl. */
export async function readFunder(
  url: string,
  client: FirecrawlClient,
  onStep?: OnStep
): Promise<Gathered> {
  onStep?.("reading_page");
  let page: Document;
  try {
    page = await client.scrape(url, PAGE_OPTIONS);
  } catch (e) {
    console.error(`readFunder: page scrape failed (${(e as Error)?.name ?? "Error"})`);
    throw new ActionError("unavailable", READ_FAILED);
  }
  const statusCode = page.metadata?.statusCode ?? null;
  const pageText = markdownOf(page);
  const pageSource: GrantSource = {
    kind: "page",
    url,
    title: titleOf(page, "The funder’s page"),
    read: !!pageText && (statusCode == null || statusCode < 400)
  };
  if (looksLoginWalled({ statusCode, markdown: pageText })) {
    return { texts: [], sources: [{ ...pageSource, read: false }], note: LOGIN_WALL_NOTE };
  }

  const texts: DraftSourceText[] = pageSource.read
    ? [{ title: pageSource.title, url, text: pageText }]
    : [];
  const sources: GrantSource[] = [pageSource];

  const links = pickDocumentLinks(page.links ?? [], page.metadata?.sourceURL ?? url);
  if (links.length) {
    onStep?.("reading_documents");
    const docs = await Promise.allSettled(links.map((l) => client.scrape(l, DOCUMENT_OPTIONS)));
    docs.forEach((r, i) => {
      const name = fileNameOf(links[i]);
      const doc = r.status === "fulfilled" ? r.value : null;
      const text = doc ? markdownOf(doc) : "";
      const ok = !!text && (doc?.metadata?.statusCode ?? 200) < 400;
      sources.push({ kind: "document", url: links[i], title: name, read: ok });
      if (ok) texts.push({ title: name, url: links[i], text });
    });
  }

  return { texts, sources, note: texts.length ? null : NO_QUESTIONS_NOTE };
}

/** A PDF (or Word file) she uploaded, read through Firecrawl's parse endpoint. */
export async function readUpload(
  file: { data: Uint8Array; filename: string; contentType: string },
  client: FirecrawlClient,
  onStep?: OnStep
): Promise<string> {
  onStep?.("reading_upload");
  let doc: Document;
  try {
    doc = await client.parse(file, UPLOAD_OPTIONS);
  } catch (e) {
    console.error(`readUpload: parse failed (${(e as Error)?.name ?? "Error"})`);
    throw new ActionError(
      "unavailable",
      "Your PDF couldn’t be read just now. Try again, or paste the questions instead."
    );
  }
  const text = markdownOf(doc);
  if (!text) {
    throw new ActionError(
      "invalid",
      "No text was found in that file. If it is a scan, paste the questions instead."
    );
  }
  return text;
}

// ------------------------------------------------------------------ Drafting

export type DraftResult =
  | { status: "drafted"; questions: GrantQuestion[]; sources: GrantSource[]; note: null }
  | { status: "needs_questions"; questions: []; sources: GrantSource[]; note: string };

/** The one model call: finds the questions in the sources and drafts every answer. */
export async function draftAnswers(
  ctx: DraftContext,
  sources: GrantSource[],
  onStep?: OnStep
): Promise<DraftResult> {
  onStep?.("drafting");
  const { system, prompt } = buildDraftPrompt(ctx);
  let output;
  try {
    ({ output } = await generateText({
      model: DRAFT_MODEL,
      system,
      prompt,
      output: Output.object({ schema: draftOutputSchema, name: "grant_application" }),
      maxOutputTokens: DRAFT_MAX_OUTPUT_TOKENS,
      temperature: 0.4,
      maxRetries: 1
    }));
  } catch (e) {
    // The name and status only: the prompt carries her profile.
    const err = e as { name?: string; statusCode?: number };
    console.error(`draftAnswers: ${err?.name ?? "Error"} (status ${err?.statusCode ?? "n/a"})`);
    throw new ActionError(
      "unavailable",
      "The AI couldn’t draft your answers just now. Try again in a minute."
    );
  }
  const questions = output.questionsFound ? toQuestions(output) : [];
  if (!questions.length) {
    const reason = output.reason?.trim();
    return {
      status: "needs_questions",
      questions: [],
      sources,
      note: reason ? `${reason.replace(/[.!]?$/, ".")} ${FALLBACK_ASK}` : NO_QUESTIONS_NOTE
    };
  }
  return { status: "drafted", questions, sources, note: null };
}

export type DraftInput = {
  grant: DraftContext["grant"];
  profile: string;
  voice: string;
  records: string;
  // Questions she pasted, or the text of a PDF she uploaded.
  provided?: { kind: "pasted" | "upload"; title: string; text: string } | null;
};

/** The whole pipeline. Throws ActionError("unavailable") when Firecrawl or the model fails. */
export async function draftApplication(
  input: DraftInput,
  client: FirecrawlClient | null,
  onStep?: OnStep
): Promise<DraftResult> {
  let gathered: Gathered;
  if (input.provided) {
    const p = input.provided;
    gathered = {
      texts: [{ title: p.title, url: null, text: p.text }],
      sources: [{ kind: p.kind, url: null, title: p.title, read: true }],
      note: null
    };
  } else if (!input.grant.url) {
    return { status: "needs_questions", questions: [], sources: [], note: NO_PAGE_NOTE };
  } else {
    if (!client) {
      throw new ActionError(
        "unavailable",
        "Reading funder pages isn’t set up yet. Paste the questions or upload the PDF instead."
      );
    }
    gathered = await readFunder(input.grant.url, client, onStep);
  }
  if (gathered.note) {
    return {
      status: "needs_questions",
      questions: [],
      sources: gathered.sources,
      note: gathered.note
    };
  }
  return draftAnswers(
    {
      grant: input.grant,
      profile: input.profile,
      voice: input.voice,
      records: input.records,
      sources: gathered.texts
    },
    gathered.sources,
    onStep
  );
}
