import { z } from "zod/v4";

import type { Database } from "@/db";
import { GRANT_SOURCES, runGrantIngestion } from "@/ingest/grants/run";
import type { Scrape } from "@/ingest/monitors/firecrawl";
import { duePages, MONITORS } from "@/ingest/monitors";
import { RADAR_SOURCES, runRadarIngestion } from "@/ingest/radar/run";
import type { Fetch } from "@/ingest/radar/types";
import { loggableError } from "@/actions/define";
import { agentAuthorized } from "@/lib/agent-actions";

// Scheduled jobs, run by the agent server's Mastra workflows: ingestion (agent/packages/server/
// src/mastra/workflows/ingest.ts) and the hourly Gmail reply check (workflows/gmail.ts). The workflow asks which sources a pipeline has today, then runs
// each one as its own step, so a failing source retries alone and no run holds one function for
// every source. The fetching, dedupe and writes stay here, next to the data.
//
// These are not chat tools: they live outside lib/agent-actions.ts's list, so the model never
// sees them. They share its AGENT_SERVICE_TOKEN.

export const PIPELINES = ["radar", "grants", "monitors"] as const;
export type Pipeline = (typeof PIPELINES)[number];

const ListInput = z.object({ pipeline: z.enum(PIPELINES) });
const RunInput = z.object({ pipeline: z.enum(PIPELINES), slug: z.string().min(1) });

export type JobDeps = {
  db?: Database;
  // Tests pass recorded responses; live runs use fetch and the Firecrawl client.
  fetchFn?: Fetch;
  scrape?: Scrape;
  now?: Date;
  // Tests pass a stub; live runs use lib/gmail-cron.ts.
  gmailReplyCheck?: () => Promise<GmailCheckResult>;
};

type GmailCheckResult =
  { ok: true; checked?: number; replied?: number; skipped?: string } | { ok: false; error: string };

async function appDb(deps: JobDeps) {
  return deps.db ?? (await import("@/db")).db;
}

// The sources a pipeline runs today. Radar and grants run every source; monitors only the
// pages due a check (ingest/monitors duePages), with no cap on how many.
export async function listIngestSources(pipeline: Pipeline, deps: JobDeps = {}) {
  const pick = ({ slug, name }: { slug: string; name: string }) => ({ slug, name });
  if (pipeline === "radar") return RADAR_SOURCES.map(pick);
  if (pipeline === "grants") return GRANT_SOURCES.map(pick);
  const due = await duePages(await appDb(deps), MONITORS, deps.now ?? new Date());
  return due.map(pick);
}

// Runs one source through its pipeline's own runner, which records the outcome on the source
// row and in the activity log. Returns that runner's result: ok with counts, or ok: false.
export async function runIngestSource(pipeline: Pipeline, slug: string, deps: JobDeps = {}) {
  const db = await appDb(deps);
  const now = deps.now ?? new Date();
  if (pipeline === "radar") {
    const source = RADAR_SOURCES.find((s) => s.slug === slug);
    if (!source) return null;
    const [result] = await runRadarIngestion({
      db,
      fetchFn: deps.fetchFn,
      radarSources: [source],
      now
    });
    return result;
  }
  if (pipeline === "grants") {
    const source = GRANT_SOURCES.find((s) => s.slug === slug);
    if (!source) return null;
    const [result] = await runGrantIngestion({
      db,
      fetchFn: deps.fetchFn,
      grantSources: [source],
      now
    });
    return result;
  }
  const monitor = MONITORS.find((m) => m.slug === slug);
  if (!monitor) return null;
  const { firecrawlScrape, monitorSource } = await import("@/ingest/monitors/firecrawl");
  // The page the workflow names runs whether or not it is due: the list step already chose it.
  // Radar's runner, as runMonitors uses, so dedupe and failure logging match the feeds.
  const [result] = await runRadarIngestion({
    db,
    radarSources: [monitorSource(monitor, deps.scrape ?? firecrawlScrape())],
    now
  });
  return result;
}

// The hourly Gmail reply check (lib/gmail-cron.ts), run by the agent server's gmail-reply-check
// workflow. Like a source, a failed check answers 200 with ok: false and the workflow retries it.
export async function runGmailCheckJob(deps: JobDeps = {}): Promise<GmailCheckResult> {
  if (deps.gmailReplyCheck) return deps.gmailReplyCheck();
  const { runGmailReplyCheck } = await import("@/lib/gmail-cron");
  return runGmailReplyCheck();
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const JOBS = {
  listIngestSources: {
    input: ListInput,
    run: async ({ pipeline }: z.output<typeof ListInput>, deps: JobDeps) => ({
      sources: await listIngestSources(pipeline, deps)
    })
  },
  ingestSource: {
    input: RunInput,
    run: async ({ pipeline, slug }: z.output<typeof RunInput>, deps: JobDeps) =>
      runIngestSource(pipeline, slug, deps)
  },
  gmailReplyCheck: {
    input: z.object({}),
    run: async (_: unknown, deps: JobDeps) => runGmailCheckJob(deps)
  }
} as const;

// POST /api/agent/jobs/:name. A source that fails still answers 200 with ok: false (the run
// happened and was logged); the workflow step retries it. Errors are for a bad call.
export async function handleRunAgentJob(request: Request, name: string, deps: JobDeps = {}) {
  if (!agentAuthorized(request)) return json({ error: "unauthorized" }, 401);
  const job = JOBS[name as keyof typeof JOBS];
  if (!job) return json({ ok: false, error: { code: "not_found", message: "No such job" } }, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: { code: "invalid", message: "Body must be JSON" } }, 400);
  }
  const parsed = job.input.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input";
    return json({ ok: false, error: { code: "invalid", message } }, 400);
  }

  try {
    const data = await (job.run as (i: unknown, d: JobDeps) => Promise<unknown>)(parsed.data, deps);
    if (data === null)
      return json({ ok: false, error: { code: "not_found", message: "No such source" } }, 404);
    return json({ ok: true, data });
  } catch (e) {
    // The runners catch a source's own failure; this is a database or setup error
    // (FIRECRAWL_API_KEY unset, the database unreachable).
    // A failed query's message carries its parameters; loggableError keeps only its kind.
    const safe = loggableError(e);
    console.error(`agent job ${name} failed`, safe);
    const message =
      typeof safe === "string" ? safe : e instanceof Error ? e.message.slice(0, 300) : "Failed";
    return json({ ok: false, error: { code: "internal", message } }, 500);
  }
}
