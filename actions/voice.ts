import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import type { Executor } from "@/db";
import { notes, voiceGuide as voiceGuideTable } from "@/db/schema";
import { gmail, googleSession, mapLimit, parseAddressList, type GoogleSession } from "@/lib/google";
import { fetchPublicText } from "@/lib/safe-fetch";
import { distilVoiceGuide, VOICE_MODEL } from "@/lib/voice-ai";
import {
  clipText,
  ownEmailText,
  htmlToText,
  SAMPLE_MAX,
  SAMPLE_SOURCES,
  SAMPLES_MAX,
  sampleRefSchema,
  VOICE_GUIDE_TEXT_MAX,
  voiceGuide,
  voiceSampleSchema,
  websiteCopy,
  type SampleRef,
  type SampleSource,
  type VoiceSample
} from "@/lib/voice-guide";
import { loadBusinessProfile } from "./business";
import { ActionError, defineAction } from "./define";

// Settings → Your voice: her voice guide, the samples it is built from, and the one AI pass.

// The one row (one user).
const ROW_ID = "main";

export type StoredVoiceGuide = { guide: string; sources: SampleRef[]; updatedAt: Date | null };

export async function loadVoiceGuide(db: Executor): Promise<StoredVoiceGuide> {
  const [row] = await db.select().from(voiceGuideTable).where(eq(voiceGuideTable.id, ROW_ID));
  if (!row) return { guide: "", sources: [], updatedAt: null };
  return { guide: row.guide, sources: row.sources, updatedAt: row.updatedAt };
}

// The capped guide the chat agent reads, straight from the database ("" when she has none).
export async function loadVoiceGuideContext(db: Executor) {
  return voiceGuide((await loadVoiceGuide(db)).guide);
}

const storedSchema = z.object({
  guide: z.string(),
  sources: z.array(sampleRefSchema),
  updatedAt: z.date().nullable()
});

// What the agent sees: the guide and when it changed. The sample labels (her email subjects and
// note titles) stay out; only the Settings page reads them.
export const getVoiceGuide = defineAction({
  name: "getVoiceGuide",
  description:
    "Simone's voice guide: how she writes (vocabulary, sentence length, warmth, greetings and sign-offs, do's and don'ts), as she keeps it in Settings → Your voice, and when it was last updated. Empty when she hasn't made one yet. `context` is the same guide capped for the agent's per-turn context.",
  kind: "read",
  input: z.object({}),
  output: z.object({ guide: z.string(), context: z.string(), updatedAt: z.date().nullable() }),
  async handler(_input, db) {
    const { guide, updatedAt } = await loadVoiceGuide(db);
    // `context`: what the agent server puts in front of the model on every turn, capped
    // here (voiceGuide, VOICE_GUIDE_MAX) so the app owns the limit.
    return { guide, context: voiceGuide(guide), updatedAt };
  }
});

// The guide with the samples it was built from, for the Settings → Your voice page only. Not in
// allActions, so the labels never reach the agent.
export const getVoiceGuideForEditing = defineAction({
  name: "getVoiceGuideForEditing",
  description:
    "Simone's voice guide with the samples it was built from, for Settings → Your voice.",
  kind: "read",
  input: z.object({}),
  output: storedSchema,
  handler: (_input, db) => loadVoiceGuide(db)
});

// ------------------------------------------------------------------ Gathering samples

type GmailHeader = { name: string; value: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string | null };
  parts?: GmailPart[];
};
export type GmailFullMessage = { id: string; internalDate?: string | null; payload?: GmailPart };

// Recent sent mail read, and at most this many offered as samples.
const SENT_SCANNED = 25;
const SENT_OFFERED = 12;
// Shorter than this after the quoted reply is cut, an email says too little about her voice.
const EMAIL_MIN = 80;
const NOTES_OFFERED = 8;
const NOTE_MIN = 200;
const WEBSITE_TIMEOUT_MS = 8_000;

const headerOf = (part: GmailPart | undefined, name: string) =>
  part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;

// The first body part of this type that isn't an attachment, decoded.
function bodyOf(part: GmailPart | undefined, mimeType: string): string | null {
  if (!part) return null;
  if (part.mimeType === mimeType && part.body?.data && !part.filename) {
    return Buffer.from(part.body.data, "base64url").toString("utf8");
  }
  for (const child of part.parts ?? []) {
    const found = bodyOf(child, mimeType);
    if (found) return found;
  }
  return null;
}

// One sent email as a sample, or null when it isn't hers to learn from: mail to herself only
// (the daily summary), or too short once the quoted message is cut.
export function sentEmailSample(m: GmailFullMessage, me: Set<string>): VoiceSample | null {
  const recipients = [
    ...parseAddressList(headerOf(m.payload, "To")),
    ...parseAddressList(headerOf(m.payload, "Cc"))
  ];
  if (!recipients.some((r) => !me.has(r.address))) return null;
  const plain = bodyOf(m.payload, "text/plain");
  const html = plain ? null : bodyOf(m.payload, "text/html");
  const raw = plain ?? (html ? htmlToText(html) : "");
  const text = clipText(ownEmailText(raw), SAMPLE_MAX);
  if (text.length < EMAIL_MIN) return null;
  const subject = headerOf(m.payload, "Subject")?.trim() || "(no subject)";
  return { id: `gmail:${m.id}`, source: "gmail", label: subject.slice(0, 300), text };
}

async function sentEmailSamples(session: GoogleSession) {
  const list = await gmail<{ messages?: { id: string }[] }>(session, "/messages", {
    query: { q: "in:sent -in:chats newer_than:365d", maxResults: SENT_SCANNED }
  });
  // One message that fails to load is skipped; the rest are still offered.
  const messages = await mapLimit(list.messages ?? [], 6, (m) =>
    gmail<GmailFullMessage>(session, `/messages/${encodeURIComponent(m.id)}`, {
      query: { format: "full" }
    }).catch(() => null)
  );
  const out: VoiceSample[] = [];
  for (const m of messages) {
    if (!m) continue;
    const sample = sentEmailSample(m, session.me);
    if (sample) out.push(sample);
    if (out.length >= SENT_OFFERED) break;
  }
  return out;
}

// Her website from the business profile, always over https: an http:// address is asked for
// over https, and any other scheme is not fetched.
export function websiteUrl(website: string | null) {
  const w = website?.trim();
  if (!w) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(w) ? w : `https://${w}`);
    if (url.protocol === "http:") url.protocol = "https:";
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// Through fetchPublicText, since the address is whatever she typed: private and metadata hosts
// are refused on every redirect hop, and the body is capped.
async function websiteSample(url: string): Promise<VoiceSample | null> {
  const { text: html } = await fetchPublicText(url, { timeoutMs: WEBSITE_TIMEOUT_MS });
  const text = clipText(websiteCopy(html), SAMPLE_MAX);
  if (!text) return null;
  return { id: "website:home", source: "website", label: new URL(url).host, text };
}

// The profile's prose. Its Notes field is left out: it holds facts for the AI, not her writing.
const PROFILE_SAMPLES = [
  ["mission", "Mission"],
  ["story", "Story"],
  ["founderBio", "Founder bio"]
] as const;

const sampleStatus = z.enum(["included", "not_connected", "none", "unavailable"]);

// Everything "Build from my writing" can offer her, each sample clipped to what the model would
// get. She picks which to use; nothing is stored until she builds. Not an agent tool: it reads
// her sent mail in full.
export const gatherVoiceSamples = defineAction({
  name: "gatherVoiceSamples",
  description:
    "Samples of Simone's own writing for building her voice guide: recent sent email (when Google is connected), her website copy, her business profile text and longer Apple Notes.",
  kind: "read",
  input: z.object({}),
  output: z.object({
    samples: z.array(voiceSampleSchema),
    gmail: sampleStatus,
    website: sampleStatus
  }),
  async handler(_input, db) {
    const profile = await loadBusinessProfile(db);
    const url = websiteUrl(profile.website);

    const [gmailResult, websiteResult, noteRows] = await Promise.all([
      googleSession(db)
        .then(sentEmailSamples)
        .then((samples) => ({ samples, status: "included" as const }))
        .catch((e) => ({
          samples: [] as VoiceSample[],
          status:
            e instanceof ActionError && e.code === "google_not_connected"
              ? ("not_connected" as const)
              : ("unavailable" as const)
        })),
      url
        ? websiteSample(url)
            .then((s) => ({ samples: s ? [s] : [], status: "included" as const }))
            .catch(() => ({ samples: [] as VoiceSample[], status: "unavailable" as const }))
        : Promise.resolve({ samples: [] as VoiceSample[], status: "none" as const }),
      db
        .select({ id: notes.id, title: notes.title, body: notes.body })
        .from(notes)
        .where(sql`coalesce(${notes.personal}, 0) = 0 and length(${notes.body}) >= ${NOTE_MIN}`)
        .orderBy(desc(sql`coalesce(${notes.noteModifiedAt}, ${notes.createdAt})`))
        .limit(NOTES_OFFERED)
    ]);

    const business: VoiceSample[] = [];
    for (const [field, label] of PROFILE_SAMPLES) {
      const text = clipText(profile[field] ?? "", SAMPLE_MAX);
      if (text) business.push({ id: `business:${field}`, source: "business", label, text });
    }
    const noteSamples: VoiceSample[] = noteRows.map((n) => ({
      id: `note:${n.id}`,
      source: "notes",
      label: n.title.trim().slice(0, 300) || "Untitled note",
      text: clipText(n.body, SAMPLE_MAX)
    }));

    return {
      samples: [...gmailResult.samples, ...websiteResult.samples, ...business, ...noteSamples],
      gmail: gmailResult.status,
      website: websiteResult.status
    };
  }
});

// ------------------------------------------------------------------ Building and editing

const countBy = (refs: SampleRef[]) =>
  Object.fromEntries(
    SAMPLE_SOURCES.map((s) => [s, refs.filter((r) => r.source === s).length]).filter(([, n]) => n)
  ) as Partial<Record<SampleSource, number>>;

// One AI pass over the samples she picked; the result replaces the stored guide. Not an agent
// tool: it spends AI budget, and she starts it from Settings.
export const buildVoiceGuide = defineAction({
  name: "buildVoiceGuide",
  description:
    "Distil Simone's voice guide from the writing samples she picked (one AI call) and save it, replacing the current guide.",
  kind: "write",
  input: z.object({ samples: z.array(voiceSampleSchema).min(1).max(SAMPLES_MAX) }),
  output: storedSchema,
  // The model call runs before the transaction opens, so it never holds the database lock.
  prepare: (input) => distilVoiceGuide(input.samples),
  async handler(_input, db, prepared) {
    const sources = prepared.used.map((s) => ({ source: s.source, label: s.label }));
    const values = { guide: prepared.guide, sources, updatedAt: new Date() };
    await db
      .insert(voiceGuideTable)
      .values({ id: ROW_ID, ...values })
      .onConflictDoUpdate({ target: voiceGuideTable.id, set: values });
    return loadVoiceGuide(db);
  },
  // Counts per source only: subjects and note titles stay out of the log.
  log: (_input, result) => ({
    entityType: "voice_guide",
    entityId: ROW_ID,
    summary: `Built the voice guide from ${result.sources.length} sample${result.sources.length === 1 ? "" : "s"} of her writing`,
    data: { samples: countBy(result.sources), model: VOICE_MODEL }
  })
});

export const updateVoiceGuide = defineAction({
  name: "updateVoiceGuide",
  description: "Save Simone's edits to her voice guide. An empty guide clears it.",
  kind: "write",
  input: z.object({ guide: z.string().max(VOICE_GUIDE_TEXT_MAX) }),
  output: storedSchema.extend({ changed: z.boolean() }),
  async handler(input, db) {
    const before = await loadVoiceGuide(db);
    const guide = input.guide.replace(/\r\n?/g, "\n").trim();
    if (guide === before.guide) return { ...before, changed: false };
    await db
      .insert(voiceGuideTable)
      .values({ id: ROW_ID, guide })
      .onConflictDoUpdate({
        target: voiceGuideTable.id,
        set: { guide, updatedAt: new Date() }
      });
    return { ...(await loadVoiceGuide(db)), changed: true };
  },
  log: (_input, result) => ({
    entityType: "voice_guide",
    entityId: ROW_ID,
    summary: !result.changed
      ? "Saved the voice guide (no changes)"
      : result.guide
        ? "Edited the voice guide"
        : "Cleared the voice guide"
  })
});
