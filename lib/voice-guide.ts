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
// has none yet. getVoiceGuide returns it as `context`, and the agent's turn-context processor puts
// it in a system message after the instructions on every message (agent/…/lib/business-context.ts).
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

// Elements whose content is never text, and elements whose end is a line break.
const SKIPPED = new Set(["script", "style", "noscript", "svg", "head", "template"]);
const BLOCKS = new Set([
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "ul",
  "ol",
  "section",
  "article",
  "header",
  "footer",
  "blockquote",
  "tr",
  "table"
]);
const TAG_NAME = /^(\/?)([a-z][a-z0-9-]*)/i;

// Readable text from an HTML page or email: scripts, styles and markup dropped, block ends
// turned into line breaks, entities decoded. One pass with indexOf, never a backtracking regex,
// so a page full of unclosed tags or comments still takes linear time; anything after an
// unclosed tag or comment is dropped.
export function htmlToText(html: string) {
  const lower = html.toLowerCase();
  const out: string[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      out.push(html.slice(i));
      break;
    }
    out.push(html.slice(i, lt));
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      if (end === -1) break;
      out.push(" ");
      i = end + 3;
      continue;
    }
    const gt = html.indexOf(">", lt + 1);
    if (gt === -1) break;
    i = gt + 1;
    const m = TAG_NAME.exec(html.slice(lt + 1, Math.min(gt, lt + 40)));
    if (!m) {
      out.push(" ");
      continue;
    }
    const name = m[2].toLowerCase();
    const closing = m[1] === "/";
    if (!closing && SKIPPED.has(name) && html[gt - 1] !== "/") {
      const close = lower.indexOf(`</${name}`, i);
      const closeGt = close === -1 ? -1 : html.indexOf(">", close);
      if (closeGt === -1) break;
      out.push(" ");
      i = closeGt + 1;
      continue;
    }
    out.push(name === "br" || (closing && BLOCKS.has(name)) ? "\n" : " ");
  }
  return collapse(decodeHTML(out.join("")));
}

// Website copy: the lines that read as sentences (six words or more), so menus, buttons and
// footers are left out.
export function websiteCopy(html: string) {
  const seen = new Set<string>();
  return htmlToText(html)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.split(" ").length >= 6 && !seen.has(l) && !!seen.add(l))
    .join("\n\n");
}

// The most of one email read: her words come first, so a long thread's tail is never needed.
const EMAIL_READ_MAX = 20_000;

// What she wrote in a sent email: the quoted message she replied to and forwarded parts are cut.
export function ownEmailText(body: string) {
  let t = body.slice(0, EMAIL_READ_MAX).replace(/\r\n?/g, "\n");
  // "On Mon, Oct 5, 2026 at 9:12 AM Lena <lena@x.com> wrote:", which Gmail may wrap once. Checked
  // line by line with plain string tests, so a long line never makes a regex backtrack.
  const lines = t.split("\n");
  const isOn = (l: string) => l.startsWith("On ") || l.includes(" On ");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.endsWith("wrote:") && (isOn(line) || isOn(lines[i - 1].trim()))) {
      t = lines.slice(0, isOn(line) ? i : i - 1).join("\n");
      break;
    }
  }
  for (const marker of [/\n-{2,} ?(Original Message|Forwarded message) ?-{2,}/i, /\n_{10,}\n/]) {
    const m = marker.exec(t);
    if (m) t = t.slice(0, m.index);
  }
  const outlook = t.search(/\nFrom: [^\n]{1,300}\n(Sent|Date): /);
  if (outlook !== -1) t = t.slice(0, outlook);
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
