import { newsletterQueue, recordNewsletterSync } from "@/actions/newsletter";
import type { ActionContext } from "@/actions/define";
import { BLOCKED_STATUSES, fluentClient, fluentConfig, FluentError } from "./fluentcrm";

type Outcome = {
  contactId: string;
  result: "added" | "removed" | "blocked" | "failed";
  fluentcrmId?: number;
};

export type SyncResult =
  | { connected: false }
  | {
      connected: true;
      added: number;
      removed: number;
      blocked: number;
      failed: number;
      error: string | null;
    };

// Push newsletter changes to FluentCRM. The HTTP calls happen outside any database
// transaction; the outcomes are saved in one write at the end.
export async function runNewsletterSync(
  opts: {
    ctx?: ActionContext;
    env?: Record<string, string | undefined>;
    fetch?: typeof fetch;
  } = {}
): Promise<SyncResult> {
  const config = fluentConfig(opts.env ?? process.env);
  if (!config) return { connected: false };
  const crm = fluentClient(config, opts.fetch ?? fetch);

  const startedAt = new Date();
  const queue = await newsletterQueue.run({}, opts.ctx);
  const outcomes: Outcome[] = [];
  let error: string | null = null;

  const attempt = async (contactId: string, work: () => Promise<Omit<Outcome, "contactId">>) => {
    try {
      outcomes.push({ contactId, ...(await work()) });
    } catch (e) {
      outcomes.push({ contactId, result: "failed" });
      error ??= e instanceof FluentError ? e.message : "Couldn't reach FluentCRM";
      // A login failure will fail every call; stop instead of hammering the site.
      if (e instanceof FluentError && (e.status === 401 || e.status === 403)) throw e;
    }
  };

  try {
    for (const c of queue.add) {
      await attempt(c.contactId, async () => {
        const found = await crm.findByEmail(c.email);
        if (!found) {
          const created = await crm.create(c);
          return { result: "added", fluentcrmId: created.id };
        }
        // Someone who unsubscribed in FluentCRM is never put back on the list from here.
        if (BLOCKED_STATUSES.has(found.status)) return { result: "blocked", fluentcrmId: found.id };
        await crm.attachList(found.id);
        return { result: "added", fluentcrmId: found.id };
      });
    }
    for (const c of queue.remove) {
      await attempt(c.contactId, async () => {
        const target = c.fluentcrmId ?? (await crm.findByEmail(c.email))?.id;
        if (target) await crm.detachList(target);
        return { result: "removed", fluentcrmId: target };
      });
    }
  } catch {
    // Login refused: whatever was not tried stays queued.
  }

  const counts = outcomes.length
    ? await recordNewsletterSync.run({ startedAt, outcomes }, opts.ctx)
    : { added: 0, removed: 0, blocked: 0, failed: 0 };
  const untried = queue.add.length + queue.remove.length - outcomes.length;
  return { connected: true, ...counts, failed: counts.failed + untried, error };
}
