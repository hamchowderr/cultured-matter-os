import { z } from "zod/v4";

import { clipText } from "@/lib/voice-guide";

// Grant application drafting: the funder's questions and her drafted answers, saved with the
// grant (grant_applications). Pure code only, so the page, the actions, the drafting pipeline
// (lib/grant-draft.ts) and the tests share it. Nothing here is ever sent to a funder.

export const APPLICATION_STATUSES = ["needs_questions", "drafted", "edited"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

// The most questions one draft keeps, and the longest answer she can save.
export const QUESTIONS_MAX = 30;
export const ANSWER_MAX = 20_000;
// The longest set of questions she can paste (or that an uploaded PDF gives).
export const PASTED_MAX = 40_000;

export const grantQuestionSchema = z.object({
  id: z.string().min(1).max(40),
  question: z.string().trim().min(1).max(2_000),
  limit: z.string().trim().max(200).nullable(),
  maxWords: z.number().int().positive().nullable(),
  maxChars: z.number().int().positive().nullable(),
  answer: z.string().max(ANSWER_MAX)
});
export type GrantQuestion = z.infer<typeof grantQuestionSchema>;

export const SOURCE_KINDS = ["page", "document", "upload", "pasted"] as const;
export const grantSourceSchema = z.object({
  kind: z.enum(SOURCE_KINDS),
  url: z.string().nullable(),
  title: z.string().max(300),
  read: z.boolean()
});
export type GrantSource = z.infer<typeof grantSourceSchema>;

// ------------------------------------------------------------------ Progress

// The steps the grant page shows while a draft runs (app/api/grants/[id]/draft streams them).
export const DRAFT_STEPS = [
  "reading_page",
  "reading_documents",
  "reading_upload",
  "drafting"
] as const;
export type DraftStep = (typeof DRAFT_STEPS)[number];
export const STEP_LABELS: Record<DraftStep, string> = {
  reading_page: "Reading the funder’s page",
  reading_documents: "Reading the linked documents",
  reading_upload: "Reading your PDF",
  drafting: "Writing your answers"
};

// ------------------------------------------------------------------ Finding the documents

// Linked files that can hold the questions: PDFs and Word files (Firecrawl parses both).
const DOCUMENT_EXT = /\.(pdf|docx?)$/i;
// Words in a file name or link that mark the application itself, best first.
const DOCUMENT_HINTS: [RegExp, number][] = [
  [/template|questionnaire|question|form|narrative|proposal|application|apply/i, 3],
  [/solicitation|guideline|guidance|instruction|nofo|rfp|rfa|request[-_ ]for/i, 2],
  [/criteria|program|grant|funding|manual/i, 1]
];
// Files that are never the questions: reports, flyers, agendas, minutes, press.
const DOCUMENT_SKIP =
  /report|newsletter|flyer|agenda|minutes|press|alert|map|presentation|slides|webinar|faq/i;

export const DOCUMENTS_MAX = 2;

// A link's file name, decoded when it can be ("Proposal%20Template.docx" → "Proposal Template.docx").
export function fileNameOf(url: string) {
  const name = new URL(url).pathname.split("/").pop() || "Document";
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/**
 * The linked documents most likely to hold the application questions, best first, at most
 * DOCUMENTS_MAX. Links are made absolute against the page and deduplicated; anything that is
 * not an http(s) PDF or Word file is dropped.
 */
export function pickDocumentLinks(links: readonly string[], pageUrl: string): string[] {
  const seen = new Set<string>();
  const scored: { url: string; score: number; order: number }[] = [];
  links.forEach((link, order) => {
    let url: URL;
    try {
      url = new URL(link, pageUrl);
    } catch {
      return;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
    url.hash = "";
    const name = fileNameOf(url.href);
    if (!DOCUMENT_EXT.test(name)) return;
    const key = url.href;
    if (seen.has(key)) return;
    seen.add(key);
    if (DOCUMENT_SKIP.test(name)) return;
    const score = DOCUMENT_HINTS.reduce((s, [re, w]) => (re.test(name) ? s + w : s), 0);
    if (score > 0) scored.push({ url: key, score, order });
  });
  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, DOCUMENTS_MAX)
    .map((d) => d.url);
}

// ------------------------------------------------------------------ Login walls

const SIGN_IN =
  /\b(sign[ -]?in|log[ -]?in|password|webpass|create an account|authorized use only)\b/i;

/**
 * A page that is only a sign-in screen: an HTTP 401 or 403, or a short page that asks her to
 * sign in. Checked before the AI call, so a login wall costs nothing to draft.
 */
export function looksLoginWalled(page: { statusCode?: number | null; markdown?: string | null }) {
  if (page.statusCode === 401 || page.statusCode === 403) return true;
  const text = (page.markdown ?? "").trim();
  return text.length < 2_500 && SIGN_IN.test(text);
}

// What every "couldn't read the questions" note ends with: the fallback the page offers.
export const FALLBACK_ASK =
  "Upload the application PDF or paste the questions to draft your answers.";
export const LOGIN_WALL_NOTE = `The funder’s application is behind a sign-in (or its site blocks automated reading), so its questions couldn’t be read. ${FALLBACK_ASK}`;
export const NO_QUESTIONS_NOTE = `No application questions were found on the funder’s page or its linked documents. ${FALLBACK_ASK}`;
export const NO_PAGE_NOTE = `This grant has no listing link to read. ${FALLBACK_ASK}`;

// ------------------------------------------------------------------ Capping the input

// What one draft sends the model, in characters: the funder's text (all sources together) and
// her own context. About 14,000 tokens in at most, so one draft costs a few cents
// (lib/grant-draft.ts).
export const SOURCE_MAX = 20_000;
export const SOURCES_TOTAL_MAX = 48_000;
export const PROFILE_MAX = 4_000;
export const RECORDS_MAX = 1_500;

/// How strongly a piece of text reads like an application question: a stated limit is the
// strongest sign, then a question mark, then a prompt verb.
const LIMIT_SIGNAL =
  /\b(words?|characters?|pages?)\b[^.\n]{0,40}\b(max|maximum|limit|no more than|up to|or less|or fewer)\b|\b(max|maximum|limit|no more than|up to)\b[^.\n]{0,40}\b(words?|characters?|pages?)\b/i;
const PROMPT_SIGNAL =
  /\b(describe|explain|discuss|identify|summari[sz]e|tell us|provide a|list (all|any|the))\b/i;
function questionScore(piece: string) {
  return (
    (LIMIT_SIGNAL.test(piece) ? 4 : 0) +
    (piece.includes("?") ? 2 : 0) +
    (PROMPT_SIGNAL.test(piece) ? 1 : 0)
  );
}
// The size of one piece a long source is cut into.
const PIECE_MAX = 600;

// Paragraphs, with any paragraph longer than PIECE_MAX (PDF text often has no blank lines)
// cut into runs of whole lines.
function pieces(text: string) {
  const out: string[] = [];
  for (const para of text.split(/\n{2,}/)) {
    if (para.length <= PIECE_MAX) {
      out.push(para);
      continue;
    }
    let run = "";
    for (const line of para.split("\n")) {
      if (run && run.length + line.length + 1 > PIECE_MAX) {
        out.push(run);
        run = "";
      }
      run = run ? `${run}\n${line}` : line;
    }
    if (run) out.push(run);
  }
  return out.map((p) => p.trim()).filter(Boolean);
}

/**
 * A long source cut to `max` characters without losing its questions: the opening, then the
 * pieces that read most like questions or limits, put back in document order. Short sources
 * pass whole.
 */
export function capSource(text: string, max: number): string {
  const t = text.replace(/\r\n?/g, "\n").trim();
  if (t.length <= max) return t;
  const head = clipText(t, Math.floor(max * 0.15));
  const rest = pieces(t.slice(head.length)).map((p, i) => ({
    i,
    text: clipText(p, PIECE_MAX * 2),
    score: questionScore(p)
  }));
  let used = head.length;
  const keep = new Set<number>();
  const best = rest.filter((r) => r.score > 0).sort((a, b) => b.score - a.score || a.i - b.i);
  for (const p of best) {
    if (used + p.text.length + 2 > max) continue;
    keep.add(p.i);
    used += p.text.length + 2;
  }
  const kept = rest.filter((r) => keep.has(r.i)).map((r) => r.text);
  return [head, ...kept].join("\n\n").slice(0, max);
}

export type DraftSourceText = { title: string; url: string | null; text: string };

/**
 * Every source capped, all of them together under SOURCES_TOTAL_MAX. The budget is shared
 * fairly: short sources pass whole and what they leave goes to the longer ones, so a long
 * solicitation never crowds out the application form beside it. Order is kept.
 */
export function capSources(sources: DraftSourceText[]): DraftSourceText[] {
  const budget = new Map<number, number>();
  let left = SOURCES_TOTAL_MAX;
  const bySize = sources.map((s, i) => ({ i, n: s.text.trim().length })).sort((a, b) => a.n - b.n);
  bySize.forEach(({ i, n }, k) => {
    const share = Math.min(SOURCE_MAX, n, Math.floor(left / (bySize.length - k)));
    budget.set(i, share);
    left -= share;
  });
  return sources
    .map((s, i) => ({ ...s, text: capSource(s.text, budget.get(i) ?? 0) }))
    .filter((s) => s.text);
}

// ------------------------------------------------------------------ The prompt

// Every draft's prompt starts with this line (AIMock matches on it in tests and the dev loop).
export const DRAFT_PROMPT_LEAD = "Draft this grant application.";

export type DraftContext = {
  grant: {
    title: string;
    agency: string | null;
    url: string | null;
    description: string | null;
    deadline: Date | null;
    amount: string | null;
  };
  profile: string;
  voice: string;
  records: string;
  sources: DraftSourceText[];
};

const SYSTEM = `You help Simone, founder of a small business, draft grant applications. You are given the funder's material (its page, linked documents, or questions she pasted), her business profile, her voice guide and some of her records.

1. Find every question or prompt the applicant must answer in writing: narrative questions, short-answer fields (for example "Project name", "Amount requested") and section prompts. Leave out checklists, check boxes, signatures, budget tables, file attachments and instructions that ask for nothing.
2. Keep each question's wording as the funder wrote it, in the funder's order. Copy any limit as written ("200 words", "1 page") into limit, and set maxWords or maxChars when the limit is a word or character count.
3. Draft one answer per question, in her voice (follow the voice guide), using only facts from her profile and records. Where a fact is missing, write a short placeholder in square brackets, such as [Add: total project cost], instead of inventing it.
4. Keep every answer within its stated limit, and short: at most about 250 words even when the limit allows more. For a long-form section measured in pages ("5 pages", "Section 4: 6 pages"), write an outline she can expand instead of the full text: a one-line opening, then 3 to 6 short bullet points, each a heading with one sentence.
5. If the material holds no application questions (for example it is a sign-in page or a general overview), return questionsFound false, no questions, and a one-sentence reason.

Plain text answers, no markdown headings (a plain "- " list is fine for an outline). Never claim anything was submitted.`;

export const DRAFT_SYSTEM = SYSTEM;

const fmtDate = (d: Date | null) =>
  d ? d.toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" }) : "rolling";

export function buildDraftPrompt(ctx: DraftContext) {
  const g = ctx.grant;
  const sources = capSources(ctx.sources);
  const parts = [
    DRAFT_PROMPT_LEAD,
    "",
    "## The grant",
    `Title: ${g.title}`,
    g.agency ? `Funder: ${g.agency}` : null,
    `Deadline: ${fmtDate(g.deadline)}`,
    g.amount ? `Amount: ${g.amount}` : null,
    g.url ? `Listing: ${g.url}` : null,
    g.description ? `About: ${clipText(g.description, 1_500)}` : null,
    "",
    "## The funder's material",
    ...sources.flatMap((s, i) => [
      `### Source ${i + 1}: ${s.title}${s.url ? ` (${s.url})` : ""}`,
      s.text,
      ""
    ]),
    "## Her business profile",
    clipText(ctx.profile, PROFILE_MAX) || "(empty)",
    "",
    "## Her voice guide",
    ctx.voice || "(none yet: write plainly and warmly)",
    "",
    "## Her records",
    clipText(ctx.records, RECORDS_MAX) || "(none)"
  ];
  return {
    system: SYSTEM,
    prompt: parts.filter((p): p is string => p != null).join("\n"),
    sources
  };
}

// What the model returns (AI SDK structured output).
export const draftOutputSchema = z.object({
  questionsFound: z.boolean(),
  reason: z.string().nullable(),
  questions: z
    .array(
      z.object({
        question: z.string(),
        limit: z.string().nullable(),
        maxWords: z.number().int().nullable(),
        maxChars: z.number().int().nullable(),
        answer: z.string()
      })
    )
    .max(60)
});
export type DraftOutput = z.infer<typeof draftOutputSchema>;

const normaliseQuestion = (q: string) =>
  q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * A question's id: a hash of its normalised text (FNV-1a, 32-bit), so the same question keeps
 * the same id across drafts and edits never land on a different question. Pure JS, since the
 * page imports this module too.
 */
export function questionId(question: string) {
  let h = 0x811c9dc5;
  for (const ch of normaliseQuestion(question)) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `q_${h.toString(36)}`;
}

// The model's questions as stored: blanks dropped, duplicates merged, counts sane, ids stable.
export function toQuestions(out: DraftOutput): GrantQuestion[] {
  const seen = new Set<string>();
  const questions: GrantQuestion[] = [];
  for (const q of out.questions) {
    const question = q.question.trim().slice(0, 2_000);
    const id = questionId(question);
    if (!normaliseQuestion(question) || seen.has(id)) continue;
    seen.add(id);
    const positive = (n: number | null) => (n != null && n > 0 ? n : null);
    questions.push({
      id,
      question,
      limit: q.limit?.trim().slice(0, 200) || null,
      maxWords: positive(q.maxWords),
      maxChars: positive(q.maxChars),
      answer: q.answer.trim().slice(0, ANSWER_MAX)
    });
    if (questions.length >= QUESTIONS_MAX) break;
  }
  return questions;
}

// ------------------------------------------------------------------ Copying and counting

export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

// Over the funder's limit, as the page warns.
export function overLimit(q: Pick<GrantQuestion, "maxWords" | "maxChars">, answer: string) {
  if (q.maxWords && wordCount(answer) > q.maxWords) return true;
  if (q.maxChars && answer.length > q.maxChars) return true;
  return false;
}

// Copy all: every question with its answer, ready to paste into the funder's form or a document.
export function copyAllText(
  grantTitle: string,
  questions: Pick<GrantQuestion, "question" | "limit" | "answer">[]
) {
  const blocks = questions.map(
    (q, i) => `${i + 1}. ${q.question}${q.limit ? ` (${q.limit})` : ""}\n\n${q.answer.trim()}`
  );
  return [`${grantTitle}: draft application`, ...blocks].join("\n\n\n");
}
