// Runs "Sync Gmail" to the end from the People page: syncGoogle reads one batch of messages per
// call and saves it (actions/gmail.ts), so this calls it until it reports done, reporting
// progress. When Gmail asks us to slow down, it waits and carries on; a sync that stops here
// (she leaves the page, or Gmail keeps refusing) continues from the same place next time.

export type SyncStep = {
  created: number;
  emailsLogged: number;
  read: number;
  total: number;
  done: boolean;
  slowedDown: boolean;
};

type StepResult =
  { ok: true; data: SyncStep } | { ok: false; error: { code: string; message: string } };

export type SyncRun =
  | { ok: true; created: number; emailsLogged: number }
  | {
      ok: false;
      created: number;
      emailsLogged: number;
      error: { code: string; message: string };
    };

// How long to let Gmail's per-minute quota recover before the next batch.
export const SLOW_DOWN_WAIT_MS = 30_000;
// After this many slow-downs in one run, stop and let her press Sync Gmail again later.
export const MAX_SLOW_DOWNS = 6;

export async function runGmailSync(
  step: () => Promise<StepResult>,
  {
    onProgress,
    onSlowedDown,
    wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
  }: {
    onProgress?: (read: number, total: number) => void;
    onSlowedDown?: () => void;
    wait?: (ms: number) => Promise<void>;
  } = {}
): Promise<SyncRun> {
  let created = 0;
  let emailsLogged = 0;
  let slowDowns = 0;
  const slowDown = async () => {
    slowDowns++;
    if (slowDowns > MAX_SLOW_DOWNS) return false;
    onSlowedDown?.();
    await wait(SLOW_DOWN_WAIT_MS);
    return true;
  };
  for (;;) {
    const result = await step();
    if (!result.ok) {
      if (result.error.code === "rate_limited" && (await slowDown())) continue;
      return { ok: false, created, emailsLogged, error: result.error };
    }
    const r = result.data;
    created += r.created;
    emailsLogged += r.emailsLogged;
    onProgress?.(r.read, r.total);
    if (r.done) return { ok: true, created, emailsLogged };
    if (r.slowedDown && !(await slowDown())) {
      return {
        ok: false,
        created,
        emailsLogged,
        error: {
          code: "rate_limited",
          message: `Gmail asked us to slow down. ${r.read} of ${r.total} emails are read and saved; press Sync Gmail again in a few minutes to continue.`
        }
      };
    }
  }
}
