import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { runAppJob } from '../tools/app-actions';

/**
 * # Scheduled ingestion (Radar, grants, page monitors)
 *
 * One Mastra workflow per pipeline, fired by Mastra's own scheduler (the `schedule`
 * field), not a Vercel cron. Each run:
 *
 *  1. asks the app which sources the pipeline has today (`listIngestSources`): every
 *     Radar feed and grant source; only the monitored pages that are due a check;
 *  2. runs each source as its own step iteration (`.foreach`), calling the app's
 *     `ingestSource` job. The app does the fetching, dedupe and writes, next to its
 *     data, and records the outcome on the source row and in its activity log;
 *  3. summarises. The run fails (red in Studio's schedule history) when any source
 *     still failed after its retries, naming them; the other sources were ingested.
 *
 * A failing source retries alone: the step throws on a failed source so Mastra retries
 * that iteration, and on its last attempt it returns the failure instead of throwing,
 * so the loop carries on to the next source.
 *
 * Runs, step outputs and schedule triggers are kept in Mastra's storage (libSQL) and
 * traced through the server's observability, so Studio's Workflows > Schedules view
 * shows each fire, its status and its per-source results.
 */

export const PIPELINES = ['radar', 'grants', 'monitors'] as const;
export type Pipeline = (typeof PIPELINES)[number];

const sourceSchema = z.object({ pipeline: z.enum(PIPELINES), slug: z.string(), name: z.string() });

/** One source's outcome, as the app's runner reports it. */
const resultSchema = z.object({
  slug: z.string(),
  ok: z.boolean(),
  fetched: z.number().optional(),
  created: z.number().optional(),
  updated: z.number().optional(),
  skipped: z.number().optional(),
  error: z.string().optional(),
});
export type SourceResult = z.infer<typeof resultSchema>;

const summarySchema = z.object({
  pipeline: z.enum(PIPELINES),
  sources: z.number(),
  created: z.number(),
  results: z.array(resultSchema),
});

/** Attempts after the first for one source; the run's retryConfig sets the delay between. */
export const SOURCE_RETRIES = 2;

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

const ingestSource = createStep({
  id: 'ingest-source',
  description: "Runs one source through the app's ingestion and returns its counts.",
  inputSchema: sourceSchema,
  outputSchema: resultSchema,
  retries: SOURCE_RETRIES,
  execute: async ({ inputData, retryCount }) => {
    const { pipeline, slug } = inputData;
    let result: SourceResult;
    try {
      result = resultSchema.parse(await runAppJob('ingestSource', { pipeline, slug }));
    } catch (e) {
      // The app could not be reached, timed out, or refused the call.
      result = { slug, ok: false, error: errorText(e) };
    }
    // Throwing makes Mastra run this source again; the last attempt reports instead.
    if (!result.ok && retryCount < SOURCE_RETRIES) {
      throw new Error(`${slug}: ${result.error ?? 'failed'}`);
    }
    return result;
  },
});

function listSources(pipeline: Pipeline) {
  return createStep({
    id: `list-${pipeline}-sources`,
    description: `Asks the app which ${pipeline} sources to run today.`,
    inputSchema: z.object({}),
    outputSchema: z.array(sourceSchema),
    execute: async () => {
      const data = z
        .object({ sources: z.array(z.object({ slug: z.string(), name: z.string() })) })
        .parse(await runAppJob('listIngestSources', { pipeline }, { timeoutMs: 60_000 }));
      return data.sources.map((s) => ({ pipeline, ...s }));
    },
  });
}

function summarize(pipeline: Pipeline) {
  return createStep({
    id: `summarize-${pipeline}`,
    inputSchema: z.array(resultSchema),
    outputSchema: summarySchema,
    // Reporting a failure is not a transient error: never retry it.
    retries: 0,
    execute: async ({ inputData }) => {
      const failed = inputData.filter((r) => !r.ok);
      if (failed.length) {
        const which = failed.map((r) => `${r.slug} (${r.error ?? 'failed'})`).join('; ');
        throw new Error(
          `${failed.length} of ${inputData.length} ${pipeline} sources failed: ${which}`,
        );
      }
      return {
        pipeline,
        sources: inputData.length,
        created: inputData.reduce((n, r) => n + (r.created ?? 0), 0),
        results: inputData,
      };
    },
  });
}

export type IngestWorkflowOptions = {
  pipeline: Pipeline;
  cron: string;
  /**
   * Sources run at once. Radar and monitors write companies, whose dedupe reads the
   * known companies before writing, so they run one at a time; grants can overlap.
   */
  concurrency: number;
  /** Wait between a failed source's attempts, ms. */
  retryDelayMs?: number;
  /** Off for tests, which start runs by hand. */
  scheduled?: boolean;
};

export function createIngestWorkflow({
  pipeline,
  cron,
  concurrency,
  retryDelayMs = 60_000,
  scheduled = true,
}: IngestWorkflowOptions) {
  return createWorkflow({
    id: `ingest-${pipeline}`,
    description: `Daily ${pipeline} ingestion: one step per source, run through the Cultured Matter app.`,
    inputSchema: z.object({}),
    outputSchema: summarySchema,
    // Applies to the list step (the app briefly unreachable) and sets the delay between a
    // source's attempts; ingest-source and summarize set their own attempt counts.
    retryConfig: { attempts: SOURCE_RETRIES, delay: retryDelayMs },
    // Same UTC times the Vercel crons used.
    ...(scheduled ? { schedule: { cron, timezone: 'UTC', inputData: {} } } : {}),
  })
    .then(listSources(pipeline))
    .foreach(ingestSource, { concurrency })
    .then(summarize(pipeline))
    .commit();
}

export const ingestRadarWorkflow = createIngestWorkflow({
  pipeline: 'radar',
  cron: '0 11 * * *',
  concurrency: 1,
});
export const ingestGrantsWorkflow = createIngestWorkflow({
  pipeline: 'grants',
  cron: '30 11 * * *',
  concurrency: 2,
});
export const ingestMonitorsWorkflow = createIngestWorkflow({
  pipeline: 'monitors',
  cron: '0 12 * * *',
  concurrency: 1,
});

/** Registered on the Mastra instance when the app is configured (index.ts). */
export const ingestWorkflows = {
  'ingest-radar': ingestRadarWorkflow,
  'ingest-grants': ingestGrantsWorkflow,
  'ingest-monitors': ingestMonitorsWorkflow,
};
