/**
 * # Cultured Matter: Simone's business and voice on every turn
 *
 * Two stable turn-context sections (lib/turn-context.ts) that put Simone's business
 * context and her voice guide in front of the model on every step, after the instructions.
 * Being stable, they get their own prompt-cache breakpoint ahead of today's date, so the
 * cached prefix holds until she edits one.
 *
 * Both come from the app, which owns them and their caps (lib/business-profile.ts
 * businessContext, lib/voice-guide.ts voiceGuide): the agent runs the app's read actions
 * `getBusinessProfile` (its `context`, which never includes the EIN or SAM UEI) and
 * `getVoiceGuide` (its `context`) over `POST /api/agent/actions/:name`.
 *
 * Each is cached for CONTEXT_TTL_MS, so an edit in Settings shows up within a minute
 * without an app call on every step, and dropped at once when the assistant itself
 * changes it (an approved updateBusinessProfile). If a refresh fails (the app down, slow
 * or refusing), the last good text is kept and the failure is remembered for
 * FAILURE_TTL_MS, so a hanging app doesn't add its timeout to every step; with no good
 * text yet, the section is left out. It never breaks the turn.
 */
import { onAppActionDone, runAppAction } from '../tools/app-actions';
import { stableSection } from './turn-context';

/** How long a fetched section is reused. */
export const CONTEXT_TTL_MS = 60_000;
/** How long a failed refresh is remembered before the app is asked again. */
export const FAILURE_TTL_MS = 15_000;
/** How long the agent waits for the app before giving up on a refresh. */
const APP_TIMEOUT_MS = 3_000;

/** Which cached read each agent write action changes. */
const WRITES: Record<string, string> = {
  updateBusinessProfile: 'getBusinessProfile',
};

type Entry = { value: string | undefined; okAt?: number; failedAt?: number };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<string | undefined>>();

// The assistant's own approved write: the next step reads the profile again.
onAppActionDone((name) => {
  const read = WRITES[name];
  if (read) cache.delete(read);
});

/** The `context` string an app read action returns, cached; see above for failures. */
async function appContext(action: string): Promise<string | undefined> {
  const hit = cache.get(action);
  const now = Date.now();
  if (hit?.okAt !== undefined && now - hit.okAt < CONTEXT_TTL_MS) return hit.value;
  if (hit?.failedAt !== undefined && now - hit.failedAt < FAILURE_TTL_MS) return hit.value;
  const pending = inflight.get(action);
  if (pending) return pending;
  const load = runAppAction(action, {}, { timeoutMs: APP_TIMEOUT_MS })
    .then((data) => {
      const context = (data as { context?: unknown } | undefined)?.context;
      const value = typeof context === 'string' && context.trim() ? context.trim() : undefined;
      cache.set(action, { value, okAt: Date.now() });
      return value;
    })
    .catch((e) => {
      // Keep the last good text, and wait FAILURE_TTL_MS before asking again.
      const last = cache.get(action)?.value;
      cache.set(action, { value: last, failedAt: Date.now() });
      console.warn(
        `Cultured Matter ${action} unavailable (${last ? 'using the last good copy' : 'left out'}): ${(e as Error).message}`,
      );
      return last;
    })
    .finally(() => inflight.delete(action));
  inflight.set(action, load);
  return load;
}

/** Forget the cached sections (tests, or after the app config changes). */
export function clearBusinessContextCache() {
  cache.clear();
  inflight.clear();
}

export const businessContextSection = stableSection(async () => {
  const context = await appContext('getBusinessProfile');
  return context
    ? `About Simone's business (her Settings → Business profile, the source of truth; call getBusinessProfile for more):\n${context}`
    : undefined;
});

export const voiceGuideSection = stableSection(async () => {
  const guide = await appContext('getVoiceGuide');
  return guide
    ? `Simone's voice guide (Settings → Your voice). Write anything she will send or publish (emails, posts, messages, replies) in this voice:\n${guide}`
    : undefined;
});
