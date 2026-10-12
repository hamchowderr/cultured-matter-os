import { readFileSync } from "node:fs";
import type { Document } from "@mendable/firecrawl-js";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/db";
import * as t from "@/db/schema";
import { GRANT_SOURCES } from "@/ingest/grants/run";
import { MONITORS } from "@/ingest/monitors/pages";
import { RADAR_SOURCES } from "@/ingest/radar/run";
import { thirdDerivative } from "@/ingest/radar/third-derivative";
import { handleRunAgentJob, type JobDeps } from "@/lib/agent-jobs";
import { freshDb } from "./test-db";

let db: Database;
let cleanup: () => void;
const KEY = "test-agent-service-token-0123456789";
const auth = { authorization: `Bearer ${KEY}` };
const now = new Date("2026-10-01T11:00:00Z");

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
  process.env.AGENT_SERVICE_TOKEN = KEY;
});
afterAll(() => {
  delete process.env.AGENT_SERVICE_TOKEN;
  cleanup();
});

// The saved Third Derivative feed; any other URL fails like a site that is down.
const feed = readFileSync("tests/fixtures/third-derivative.xml", "utf8");
const fetchFn = (async (input: RequestInfo | URL) => {
  if (String(input) === "https://www.third-derivative.org/portfolio/rss.xml")
    return new Response(feed);
  return new Response("down", { status: 503, statusText: "Service Unavailable" });
}) as typeof fetch;
const scrape: JobDeps["scrape"] = async (url) => {
  const m = MONITORS.find((x) => x.url === url)!;
  return JSON.parse(readFileSync(`tests/fixtures/firecrawl/${m.slug}.json`, "utf8")) as Document;
};

const call = (name: string, body: unknown, headers: Record<string, string> = auth) =>
  handleRunAgentJob(
    new Request(`http://localhost/api/agent/jobs/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body)
    }),
    name,
    { db, fetchFn, scrape, now }
  );

describe("agent ingestion jobs", () => {
  it("refuses a missing or wrong token, and is closed with no token configured", async () => {
    expect((await call("listIngestSources", { pipeline: "radar" }, {})).status).toBe(401);
    expect(
      (await call("listIngestSources", { pipeline: "radar" }, { authorization: "Bearer no" }))
        .status
    ).toBe(401);
    delete process.env.AGENT_SERVICE_TOKEN;
    expect((await call("listIngestSources", { pipeline: "radar" })).status).toBe(401);
    process.env.AGENT_SERVICE_TOKEN = KEY;
  });

  it("refuses an unknown job, a bad body and an unknown source", async () => {
    expect((await call("ingestRadar", {})).status).toBe(404);
    expect((await call("listIngestSources", "not json")).status).toBe(400);
    expect((await call("listIngestSources", { pipeline: "email" })).status).toBe(400);
    const res = await call("ingestSource", { pipeline: "radar", slug: "nope" });
    expect(res.status).toBe(404);
  });

  it("lists every radar and grant source", async () => {
    const radar = await (await call("listIngestSources", { pipeline: "radar" })).json();
    expect(radar.data.sources.map((s: { slug: string }) => s.slug)).toEqual(
      RADAR_SOURCES.map((s) => s.slug)
    );
    const grants = await (await call("listIngestSources", { pipeline: "grants" })).json();
    expect(grants.data.sources).toEqual(GRANT_SOURCES.map(({ slug, name }) => ({ slug, name })));
  });

  it("ingests one radar source and records it", async () => {
    const res = await call("ingestSource", { pipeline: "radar", slug: thirdDerivative.slug });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      data: {
        slug: thirdDerivative.slug,
        ok: true,
        fetched: 10,
        created: 10,
        updated: 0,
        skipped: 0
      }
    });
    const [{ n }] = await db.select({ n: count() }).from(t.companies);
    expect(n).toBe(10);
    // Only the named source ran.
    expect((await db.select().from(t.sources)).map((s) => s.slug)).toEqual([thirdDerivative.slug]);
  });

  it("answers a failing source with ok: false and logs it on the source row", async () => {
    const slug = GRANT_SOURCES[0].slug;
    const res = await call("ingestSource", { pipeline: "grants", slug });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({ slug, ok: false, error: expect.stringMatching(/503/) });
    const [src] = await db
      .select({ status: t.sources.lastStatus })
      .from(t.sources)
      .where(eq(t.sources.slug, slug));
    expect(src.status).toBe("failed");
  });

  it("lists every due monitor page with no cap, then scrapes one by name", async () => {
    const due = await (await call("listIngestSources", { pipeline: "monitors" })).json();
    expect(due.data.sources.map((s: { slug: string }) => s.slug)).toEqual(
      MONITORS.map((m) => m.slug)
    );

    const res = await call("ingestSource", { pipeline: "monitors", slug: "fc-epa-sbir" });
    expect((await res.json()).data).toMatchObject({ slug: "fc-epa-sbir", ok: true, fetched: 9 });

    // Checked now, so it is no longer due; the others still are.
    const after = await (await call("listIngestSources", { pipeline: "monitors" })).json();
    expect(after.data.sources.map((s: { slug: string }) => s.slug)).not.toContain("fc-epa-sbir");
    expect(after.data.sources).toHaveLength(MONITORS.length - 1);
  });
});

describe("gmail reply check job", () => {
  const gmailCall = (gmailReplyCheck: JobDeps["gmailReplyCheck"], body: unknown = {}) =>
    handleRunAgentJob(
      new Request("http://localhost/api/agent/jobs/gmailReplyCheck", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify(body)
      }),
      "gmailReplyCheck",
      { db, gmailReplyCheck }
    );

  it("runs the reply check and returns its counts", async () => {
    let runs = 0;
    const res = await gmailCall(async () => {
      runs++;
      return { ok: true, checked: 3, replied: 1 };
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { ok: true, checked: 3, replied: 1 } });
    expect(runs).toBe(1);
  });

  it("answers 200 with ok: false when the check fails, so the workflow retries it", async () => {
    const res = await gmailCall(async () => ({ ok: false, error: "Reply check failed" }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ ok: false, error: "Reply check failed" });
  });

  it("refuses a call without the service token", async () => {
    const res = await handleRunAgentJob(
      new Request("http://localhost/api/agent/jobs/gmailReplyCheck", {
        method: "POST",
        body: "{}"
      }),
      "gmailReplyCheck",
      { db, gmailReplyCheck: async () => ({ ok: true }) }
    );
    expect(res.status).toBe(401);
  });
});
