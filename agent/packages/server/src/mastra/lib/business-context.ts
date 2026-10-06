/**
 * # Cultured Matter: Simone's business and voice on every turn
 *
 * Two turn-context sections (lib/turn-context.ts) that put Simone's business context and
 * her voice guide in front of the model on every step, after the instructions, so the
 * instruction prefix stays cacheable.
 *
 * Both come from the app, which owns them and their caps (lib/business-profile.ts
 * businessContext, lib/voice-guide.ts voiceGuide): the agent runs the app's read actions
 * `getBusinessProfile` (its `context`, which never includes the EIN or SAM UEI) and
 * `getVoiceGuide` (its `context`) over `POST /api/agent/actions/:name`.
 *
 * Each is cached for CONTEXT_TTL_MS, so an edit in Settings shows up within a minute
 * without an app call on every step. Anything that goes wrong (no app configured, the
 * app down or slow, a bad answer) leaves that section out for the turn; it never breaks
 * the turn.
 */
import { runAppAction } from '../tools/app-actions';
import type { TurnContextSection } from './turn-context';

/** How long a fetched section is reused. */
export const CONTEXT_TTL_MS = 60_000;
/** How long the agent waits for the app before leaving the section out. */
const APP_TIMEOUT_MS = 3_000;

type Entry = { at: number; value: string | undefined };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<string | undefined>>();

/** The `context` string an app read action returns, cached; undefined on any failure. */
async function appContext(action: string): Promise<string | undefined> {
  const hit = cache.get(action);
  if (hit && Date.now() - hit.at < CONTEXT_TTL_MS) return hit.value;
  const pending = inflight.get(action);
  if (pending) return pending;
  const load = runAppAction(action, {}, { timeoutMs: APP_TIMEOUT_MS })
    .then((data) => {
      const context = (data as { context?: unknown } | undefined)?.context;
      const value = typeof context === 'string' && context.trim() ? context.trim() : undefined;
      cache.set(action, { at: Date.now(), value });
      return value;
    })
    .catch((e) => {
      // Not cached: the next step tries again.
      console.warn(`Cultured Matter ${action} unavailable for this turn: ${(e as Error).message}`);
      return undefined;
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

export const businessContextSection: TurnContextSection = async () => {
  const context = await appContext('getBusinessProfile');
  return context
    ? `About Simone's business (her Settings → Business profile, the source of truth; call getBusinessProfile for more):\n${context}`
    : undefined;
};

export const voiceGuideSection: TurnContextSection = async () => {
  const guide = await appContext('getVoiceGuide');
  return guide
    ? `Simone's voice guide (Settings → Your voice). Write anything she will send or publish (emails, posts, messages, replies) in this voice:\n${guide}`
    : undefined;
};
