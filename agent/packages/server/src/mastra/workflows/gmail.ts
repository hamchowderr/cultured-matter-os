import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { runAppJob } from '../tools/app-actions';

/**
 * # Hourly Gmail reply check
 *
 * Moves tasks waiting for a response to replied when their Gmail thread has a reply. It
 * used to be a Vercel cron at half past each hour; Vercel's free plan only runs crons once
 * a day, so it runs here on Mastra's scheduler at the same time instead.
 *
 * One step calls the app's `gmailReplyCheck` job (lib/agent-jobs.ts), which reads Gmail
 * and updates the tasks next to its data. A failed check throws so Mastra retries it; a
 * run that still fails shows red in Studio's Workflows > Schedules view.
 */

const resultSchema = z.object({
  ok: z.boolean(),
  checked: z.number().optional(),
  replied: z.number().optional(),
  skipped: z.string().optional(),
  error: z.string().optional(),
});

/** Attempts after the first; the run's retryConfig sets the delay between. */
export const CHECK_RETRIES = 2;

const check = createStep({
  id: 'check-gmail-replies',
  description: "Runs the app's Gmail reply check and returns its counts.",
  inputSchema: z.object({}),
  outputSchema: resultSchema,
  retries: CHECK_RETRIES,
  execute: async () => {
    const result = resultSchema.parse(await runAppJob('gmailReplyCheck', {}));
    if (!result.ok) throw new Error(`Gmail reply check: ${result.error ?? 'failed'}`);
    return result;
  },
});

export type GmailWorkflowOptions = {
  cron?: string;
  /** Wait between a failed check's attempts, ms. */
  retryDelayMs?: number;
  /** Off for tests, which start runs by hand. */
  scheduled?: boolean;
};

export function createGmailReplyWorkflow({
  cron = '30 * * * *',
  retryDelayMs = 60_000,
  scheduled = true,
}: GmailWorkflowOptions = {}) {
  return createWorkflow({
    id: 'gmail-reply-check',
    description: 'Hourly: marks waiting tasks as replied when their Gmail thread has a reply.',
    inputSchema: z.object({}),
    outputSchema: resultSchema,
    retryConfig: { attempts: CHECK_RETRIES, delay: retryDelayMs },
    ...(scheduled ? { schedule: { cron, timezone: 'UTC', inputData: {} } } : {}),
  })
    .then(check)
    .commit();
}

export const gmailReplyWorkflow = createGmailReplyWorkflow();
