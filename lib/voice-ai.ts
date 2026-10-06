import { generateText } from "ai";

import { ActionError } from "@/actions/define";
import { buildVoicePrompt, VOICE_GUIDE_TEXT_MAX, type VoiceSample } from "@/lib/voice-guide";

// The one model call behind "Build from my writing". A plain "provider/model" id: the AI SDK's
// default provider is the Vercel AI Gateway (AI_GATEWAY_API_KEY, or the Vercel OIDC token when
// deployed). Tests and the local dev loop swap the default provider for AIMock through
// globalThis.AI_SDK_DEFAULT_PROVIDER (tests/aimock-provider.ts, scripts/aimock-dev-provider.mjs),
// so nothing here knows about the mock. A small, cheap model is plenty for style analysis: one
// build is about 3,500 tokens in and at most VOICE_MAX_OUTPUT_TOKENS out, about a cent, well
// inside the $10 a month cap.
export const VOICE_MODEL = "anthropic/claude-haiku-4.5";
export const VOICE_MAX_OUTPUT_TOKENS = 800;

// Distils a guide from the samples she approved. Throws ActionError("unavailable") when the
// model can't be reached; the error log names the failure only, never the samples (her email).
export async function distilVoiceGuide(samples: VoiceSample[]) {
  const { system, prompt, used } = buildVoicePrompt(samples);
  if (!used.length) throw new ActionError("invalid", "Pick at least one sample of your writing.");
  let text: string;
  try {
    ({ text } = await generateText({
      model: VOICE_MODEL,
      system,
      prompt,
      maxOutputTokens: VOICE_MAX_OUTPUT_TOKENS,
      temperature: 0.3,
      maxRetries: 1
    }));
  } catch (e) {
    const err = e as { name?: string; statusCode?: number };
    console.error(`distilVoiceGuide: ${err?.name ?? "Error"} (status ${err?.statusCode ?? "n/a"})`);
    throw new ActionError(
      "unavailable",
      "The AI couldn’t write your guide just now. Try again in a minute."
    );
  }
  const guide = text.trim().slice(0, VOICE_GUIDE_TEXT_MAX);
  if (!guide) {
    throw new ActionError("unavailable", "The AI sent back an empty guide. Try again.");
  }
  return { guide, used };
}
