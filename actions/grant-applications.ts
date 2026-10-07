import { eq, getTableColumns, ne } from "drizzle-orm";
import { z } from "zod/v4";

import type { Executor } from "@/db";
import { grantApplications, grants, projects } from "@/db/schema";
import { formatAmount } from "@/lib/format";
import {
  APPLICATION_STATUSES,
  ANSWER_MAX,
  grantQuestionSchema,
  grantSourceSchema,
  PASTED_MAX,
  type GrantQuestion
} from "@/lib/grant-application";
import {
  draftApplication,
  DRAFT_MODEL,
  firecrawlClient,
  profileText,
  type DraftResult
} from "@/lib/grant-draft";
import { loadBusinessProfile } from "./business";
import { ActionError, defineAction } from "./define";
import { grantSchema, id } from "./schemas";
import { loadVoiceGuideContext } from "./voice";

// A grant's drafted application (the grant's page, /grants/[id]). Nothing here ever sends
// anything to a funder: she copies the answers into the funder's own form.

export const applicationSchema = z.object({
  id: z.string(),
  grantId: z.string(),
  status: z.enum(APPLICATION_STATUSES),
  questions: z.array(grantQuestionSchema),
  sources: z.array(grantSourceSchema),
  note: z.string().nullable(),
  model: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});
export type GrantApplication = z.infer<typeof applicationSchema>;

// Where the application lives in the app, for the assistant to point her to.
export const applicationPage = (grantId: string) => `/grants/${grantId}`;

export async function loadApplication(db: Executor, grantId: string) {
  const [row] = await db
    .select()
    .from(grantApplications)
    .where(eq(grantApplications.grantId, grantId));
  return row ?? null;
}

const { raw: _raw, ...grantColumns } = getTableColumns(grants);

async function loadGrant(db: Executor, grantId: string) {
  const [grant] = await db.select(grantColumns).from(grants).where(eq(grants.id, grantId));
  if (!grant) throw new ActionError("not_found", "Grant not found");
  return grant;
}

// Her active projects, one line each: the "records" a draft may draw on.
async function recordsText(db: Executor) {
  const rows = await db
    .select({ name: projects.name, description: projects.description })
    .from(projects)
    .where(ne(projects.status, "done"))
    .limit(12);
  return rows
    .map(
      (p) => `Project: ${p.name}${p.description ? ` — ${p.description.replace(/\s+/g, " ")}` : ""}`
    )
    .join("\n");
}

export const getGrantApplication = defineAction({
  name: "getGrantApplication",
  description:
    "One grant with its drafted application, if there is one: the funder's questions with their limits, Simone's draft answers, status (needs_questions when the questions couldn't be read, drafted, or edited by her), the sources the questions came from, and `page`, the app page where she edits and copies it. Null application when none has been drafted.",
  kind: "read",
  input: z.object({ grantId: id }),
  output: z.object({
    grant: grantSchema,
    page: z.string(),
    application: applicationSchema.nullable()
  }),
  async handler(input, db) {
    const grant = await loadGrant(db, input.grantId);
    return {
      grant,
      page: applicationPage(grant.id),
      application: await loadApplication(db, grant.id)
    };
  }
});

const draftInput = z.object({
  grantId: id,
  // Questions she pasted (or gave the assistant), or the text of a PDF she uploaded.
  questions: z.string().trim().min(1).max(PASTED_MAX).optional(),
  questionsFrom: z.enum(["pasted", "upload"]).default("pasted"),
  questionsTitle: z.string().trim().max(300).optional()
});

export const draftGrantApplication = defineAction({
  name: "draftGrantApplication",
  description:
    "Draft Simone's application for one grant and save it with the grant, replacing any earlier draft. Reads the funder's page and its linked application PDFs, finds every question and its limit, and drafts one answer per question from her business profile, voice guide and records (one AI call). Pass `questions` when she gives you the questions herself (pasted text); leave it out to read them from the grant's listing. When the questions can't be read (a sign-in wall), the saved application has status needs_questions and a note: ask her to paste the questions or upload the PDF on the grant's page. Never submits anything to a funder. Returns the saved application and `page`, where she reviews, edits and copies the answers.",
  kind: "write",
  input: draftInput,
  output: z.object({ grantTitle: z.string(), page: z.string(), application: applicationSchema }),
  // Firecrawl and the model run before the transaction opens, so they never hold the lock.
  async prepare(input, db, ctx): Promise<DraftResult> {
    const grant = await loadGrant(db, input.grantId);
    const [profile, voice, records] = await Promise.all([
      loadBusinessProfile(db),
      loadVoiceGuideContext(db),
      recordsText(db)
    ]);
    return draftApplication(
      {
        grant: {
          title: grant.title,
          agency: grant.agency,
          url: grant.url,
          description: grant.description,
          deadline: grant.deadline,
          amount: formatAmount(grant.amountMin, grant.amountMax)
        },
        profile: profileText(profile),
        voice,
        records,
        provided: input.questions
          ? {
              kind: input.questionsFrom,
              title:
                input.questionsTitle ||
                (input.questionsFrom === "upload" ? "Your uploaded PDF" : "Questions you pasted"),
              text: input.questions
            }
          : null
      },
      // Tests and the dev loop point the live client at a mock through FIRECRAWL_API_URL.
      input.questions ? null : firecrawlClient(),
      ctx.onStep
    );
  },
  async handler(input, db, draft) {
    const grant = await loadGrant(db, input.grantId);
    // A failed read never wipes answers she already has: they stay, with the new note.
    const current = await loadApplication(db, grant.id);
    if (draft.status === "needs_questions" && current?.questions.length) {
      await db
        .update(grantApplications)
        .set({ note: draft.note, updatedAt: new Date() })
        .where(eq(grantApplications.id, current.id));
      const kept = await loadApplication(db, grant.id);
      return { grantTitle: grant.title, page: applicationPage(grant.id), application: kept! };
    }
    const values = {
      status: draft.status,
      questions: draft.questions,
      sources: draft.sources,
      note: draft.note,
      model: draft.status === "drafted" ? DRAFT_MODEL : null,
      updatedAt: new Date()
    };
    await db
      .insert(grantApplications)
      .values({ grantId: grant.id, ...values })
      .onConflictDoUpdate({ target: grantApplications.grantId, set: values });
    const application = await loadApplication(db, grant.id);
    return { grantTitle: grant.title, page: applicationPage(grant.id), application: application! };
  },
  log: (_input, result) => ({
    entityType: "grant",
    entityId: result.application.grantId,
    summary:
      result.application.note == null
        ? `Drafted ${result.application.questions.length} answers for ${result.grantTitle}`
        : `Couldn’t read the application questions for ${result.grantTitle}`,
    data: {
      status: result.application.status,
      sources: result.application.sources.map((s) => ({ kind: s.kind, read: s.read })),
      model: result.application.model
    }
  })
});

export const updateGrantApplication = defineAction({
  name: "updateGrantApplication",
  description:
    "Save edits to the answers of a grant's drafted application. Pass only the answers that change, by question id (from getGrantApplication). Never submits anything to a funder.",
  kind: "write",
  input: z.object({
    grantId: id,
    answers: z
      .array(z.object({ id: z.string().min(1), answer: z.string().max(ANSWER_MAX) }))
      .min(1)
      .max(60)
  }),
  output: z.object({
    grantTitle: z.string(),
    page: z.string(),
    application: applicationSchema,
    changed: z.number().int()
  }),
  async handler(input, db) {
    const grant = await loadGrant(db, input.grantId);
    const current = await loadApplication(db, grant.id);
    if (!current || !current.questions.length) {
      throw new ActionError("not_found", "There is no drafted application for this grant yet.");
    }
    const byId = new Map(input.answers.map((a) => [a.id, a.answer.replace(/\r\n?/g, "\n")]));
    const unknown = [...byId.keys()].filter((k) => !current.questions.some((q) => q.id === k));
    if (unknown.length) throw new ActionError("invalid", `No question with id ${unknown[0]}`);
    let changed = 0;
    const questions: GrantQuestion[] = current.questions.map((q) => {
      const next = byId.get(q.id);
      if (next == null || next === q.answer) return q;
      changed++;
      return { ...q, answer: next };
    });
    if (changed) {
      await db
        .update(grantApplications)
        .set({ questions, status: "edited", updatedAt: new Date() })
        .where(eq(grantApplications.id, current.id));
    }
    return {
      grantTitle: grant.title,
      page: applicationPage(grant.id),
      application: (await loadApplication(db, grant.id))!,
      changed
    };
  },
  log: (_input, result) => ({
    entityType: "grant",
    entityId: result.application.grantId,
    summary: result.changed
      ? `Edited ${result.changed} answer${result.changed === 1 ? "" : "s"} for ${result.grantTitle}`
      : `Saved the application for ${result.grantTitle} (no changes)`
  })
});
