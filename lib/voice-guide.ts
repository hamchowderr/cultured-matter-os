import { decodeHTML } from "entities";
import { z } from "zod/v4";

// Her voice guide (Settings → Your voice): how Simone writes, distilled once from samples of her
// own writing she approves, then edited by her. The chat agent reads it (voiceGuide below) and
// she can paste it into ChatGPT or Claude (copyBlock). Pure code only, so the page, the actions
// and the agent share it.

export const SAMPLE_SOURCES = ["gmail", "website", "business", "notes"] as const;
export type SampleSource = (typeof SAMPLE_SOURCES)[number];

export const SOURCE_LABELS: Record<SampleSource, string> = {
  gmail: "Sent email",
  website: "Website",
  business: "Business profile",
  notes: "Apple Notes"
};

// The longest guide she can save.
export const VOICE_GUIDE_TEXT_MAX = 8_000;
// What the agent reads on every message, and the size of ChatGPT's custom-instructions box.
export const VOICE_GUIDE_MAX = 1_500;
// One sample, as she sees it and as the model gets it.
export const SAMPLE_MAX = 1_500;
// All samples in one build: about 3,500 tokens in, so one build costs about a cent.
export const SAMPLES_TOTAL_MAX = 14_000;
export const SAMPLES_MAX = 30;

export const voiceSampleSchema = z.object({
  id: z.string().min(1).max(300),
  source: z.enum(SAMPLE_SOURCES),
  label: z.string().trim().min(1).max(300),
  text: z.string().trim().min(1).max(20_000)
});
export type VoiceSample = z.infer<typeof voiceSampleSchema>;

// What the stored guide remembers about each sample it was built from: never the text.
export const sampleRefSchema = z.object({
  source: z.enum(SAMPLE_SOURCES),
  label: z.string().max(300)
});
export type SampleRef = z.infer<typeof sampleRefSchema>;

// ------------------------------------------------------------------ Clipping

const collapse = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// Cut at a paragraph or line end, else a sentence end, else a word, so text never stops
// mid-word.
export function clipText(s: string, max: number) {
  const t = collapse(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const line = cut.lastIndexOf("\n");
  if (line > max * 0.6) return cut.slice(0, line).trimEnd();
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1);
  const word = cut.lastIndexOf(" ");
  return (word > 0 ? cut.slice(0, word) : cut).replace(/[,;:]$/, "") + "…";
}

// The guide as the chat agent reads it: always at most VOICE_GUIDE_MAX characters, "" when she
// has none yet. The Mastra input processor puts this in front of the agent on every message.
export function voiceGuide(guide: string | null | undefined): string {
  const t = collapse(guide ?? "");
  return t ? clipText(t, VOICE_GUIDE_MAX) : "";
}

// The block she pastes into ChatGPT's custom instructions or her Claude preferences.
export const COPY_INTRO =
  "When you write anything for me (emails, posts, messages, replies), write it in my voice. My voice guide:";
export function copyBlock(guide: string) {
  const t = collapse(guide);
  return t ? `${COPY_INTRO}\n\n${t}` : "";
}

// ------------------------------------------------------------------ Turning sources into text

const BLOCK_END = /<\/(p|div|h[1-6]|li|ul|ol|section|article|header|footer|blockquote|tr|table)>/gi;

// Readable text from an HTML page or email: scripts, styles and markup dropped, block ends
// turned into line breaks, entities decoded.
export function htmlToText(html: string) {
  return collapse(
    decodeHTML(
      html
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<(script|style|noscript|svg|head|template)\b[\s\S]*?<\/\1>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(BLOCK_END, "\n")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

// Website copy: the lines that read as sentences (six words or more), so menus, buttons and
// footers are left out.
export function websiteCopy(html: string) {
  return htmlToText(html)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.split(/\s+/).length >= 6)
    .filter((l, i, all) => all.indexOf(l) === i)
    .join("\n\n");
}

// What she wrote in a sent email: the quoted message she replied to and forwarded parts are cut.
export function ownEmailText(body: string) {
  let t = body.replace(/\r\n?/g, "\n");
  const cuts = [
    // "On Mon, Oct 5, 2026 at 9:12 AM Lena <lena@x.com> wrote:", which Gmail may wrap once.
    /\n[^\n]*\bOn\b[^\n]*(\n[^\n]*)?\bwrote:\s*(\n|$)/,
    /\n-{2,} ?(Original Message|Forwarded message) ?-{2,}/i,
    /\n_{10,}\s*\n/,
    /\nFrom: [^\n]+\n(Sent|Date): /
  ];
  for (const re of cuts) {
    const m = re.exec(t);
    if (m) t = t.slice(0, m.index);
  }
  return collapse(
    t
      .split("\n")
      .filter((l) => !l.trimStart().startsWith(">"))
      .join("\n")
  );
}

// ------------------------------------------------------------------ The one AI pass

// Every build's prompt starts with this line (the AIMock fixtures match on it).
export const VOICE_PROMPT_LEAD = "Write my voice guide from these samples of my writing.";

export const VOICE_SYSTEM = `You study someone's writing and distil their voice into a short guide that another AI follows when it drafts text for them: emails, follow-ups, social posts, messages.

Write the guide addressed to that AI, in plain text (no Markdown headings, no bold), with exactly these parts in this order:
Vocabulary: words and phrases they use and avoid.
Sentence length: how long their sentences and paragraphs run.
Warmth and tone: how warm, direct, formal or playful they are, and how that changes with who they write to.
Greetings and sign-offs: how they open and close messages, quoted exactly when they repeat.
Do: 3 to 6 short bullet points starting with "- ".
Don't: 3 to 6 short bullet points starting with "- ".

Rules:
- Base every point on the samples. Do not invent habits the samples don't show.
- Never copy private details from the samples: no names of other people, email addresses, phone numbers, prices or dates.
- Keep the whole guide under 1,200 characters.
- Reply with the guide only.`;

// The prompt for one build. Samples are clipped to SAMPLE_MAX each and SAMPLES_TOTAL_MAX in
// all; `used` is the samples that made it in, in order.
export function buildVoicePrompt(samples: VoiceSample[]) {
  const used: VoiceSample[] = [];
  const parts: string[] = [];
  let total = 0;
  for (const s of samples.slice(0, SAMPLES_MAX)) {
    const text = clipText(s.text, SAMPLE_MAX);
    if (!text) continue;
    if (total + text.length > SAMPLES_TOTAL_MAX) break;
    total += text.length;
    used.push({ ...s, text });
    parts.push(`--- Sample ${used.length} (${SOURCE_LABELS[s.source]}) ---\n${text}`);
  }
  return { system: VOICE_SYSTEM, prompt: `${VOICE_PROMPT_LEAD}\n\n${parts.join("\n\n")}`, used };
}
