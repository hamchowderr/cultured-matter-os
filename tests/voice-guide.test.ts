import { join } from "node:path";
import { LLMock } from "@copilotkit/aimock";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Better Auth hands out the stored Google token; no real Google calls in tests.
const getAccessToken = vi.hoisted(() => vi.fn(async () => ({ accessToken: "test-token" })));
vi.mock("@/lib/auth", () => ({ auth: { api: { getAccessToken } } }));

import * as A from "@/actions";
import { loadVoiceGuideContext, sentEmailSample, type GmailFullMessage } from "@/actions/voice";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import { GOOGLE_SCOPES } from "@/lib/google-scopes";
import {
  buildVoicePrompt,
  copyBlock,
  COPY_INTRO,
  ownEmailText,
  SAMPLE_MAX,
  SAMPLES_TOTAL_MAX,
  VOICE_GUIDE_MAX,
  VOICE_PROMPT_LEAD,
  voiceGuide,
  websiteCopy,
  type VoiceSample
} from "@/lib/voice-guide";
import { freshDb } from "./test-db";

// Every model call here goes to AIMock with tests/fixtures/voice-aimock.json; Gmail and the
// website are answered by a stubbed fetch. No gateway key is read and nothing is billed.

let db: Database;
let cleanup: () => void;
let mock: LLMock;
const ctx = () => ({ db });

const ME = "simone@simonepaz.com";
const GMAIL = "gmail.googleapis.com/gmail/v1/users/me";
const SITE = "culturedmatter.example";
const FULL_SCOPE = ["openid", "email", "profile", ...GOOGLE_SCOPES].join(" ");
const realFetch = globalThis.fetch;

type Call = { url: URL; init?: RequestInit };
let calls: Call[] = [];
let routes: Record<string, (call: Call) => Response>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

function sent(
  id: string,
  opts: { to: string; subject: string; text?: string; html?: string }
): GmailFullMessage {
  const parts = [
    ...(opts.text !== undefined
      ? [{ mimeType: "text/plain", body: { data: b64(opts.text) } }]
      : []),
    ...(opts.html !== undefined ? [{ mimeType: "text/html", body: { data: b64(opts.html) } }] : [])
  ];
  return {
    id,
    internalDate: String(Date.now()),
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "From", value: `Simone Paz <${ME}>` },
        { name: "To", value: opts.to },
        { name: "Subject", value: opts.subject }
      ],
      parts
    }
  };
}

const REPLY = `Hi Lena,

Thank you for the intro to the Soliome team. I love what they are doing with reef-safe sunscreen, and I think there is a real story in it for the series. Could we find thirty minutes next week?

Warmly,
Simone

On Mon, Oct 5, 2026 at 9:12 AM Lena Fischer <lena@example.com> wrote:
> Simone, meet the Soliome founders.
> They are raising a seed round.`;

const MESSAGES: GmailFullMessage[] = [
  sent("m1", { to: "Lena Fischer <lena@example.com>", subject: "Re: Soliome intro", text: REPLY }),
  // To herself only (the daily summary): never a sample.
  sent("m2", {
    to: ME,
    subject: "Your day",
    text: "Three grants close this week and two tasks are due tomorrow. Here is everything."
  }),
  // Too short to say anything about her voice.
  sent("m3", { to: "sam@example.com", subject: "Thanks", text: "Thanks Sam!" }),
  // HTML only.
  sent("m4", {
    to: "maya@brand.example",
    subject: "Pairing idea",
    html: "<div>Hi Maya,</div><div><br></div><div>I have been thinking about a limited-edition drop that pairs your packaging with a new biomaterial. It would make a beautiful episode, and the impact numbers are real.</div><div><br></div><div>Warmly,<br>Simone</div>"
  })
];

const SITE_HTML = `<!doctype html><html><head><title>Cultured Matter</title><style>p{}</style></head>
<body><nav><a href="/">Home</a><a href="/series">Series</a></nav>
<h1>Cultured Matter</h1>
<p>We&rsquo;re a creative sustainability agency designed to shift culture.</p>
<p>Cultured Matter develops and executes creative sustainability projects through the lens of influence and innovation.</p>
<footer>© 2026 Cultured Matter</footer><script>console.log("x")</script></body></html>`;

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
  await db.insert(t.users).values({ id: "u1", name: "Simone", email: ME });
  await db.insert(t.accounts).values({
    id: "acc1",
    accountId: "google-sub",
    providerId: "google",
    userId: "u1",
    scope: "openid email profile",
    updatedAt: new Date()
  });
  mock = new LLMock({ port: 0 });
  mock.loadFixtureFile(join(__dirname, "fixtures", "voice-aimock.json"));
  await mock.start();
  process.env.USE_AIMOCK = "true";
  process.env.AIMOCK_URL = mock.url;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const raw = input instanceof Request ? input.url : String(input);
      // The model call goes to the real AIMock server.
      if (raw.startsWith(mock.url)) return realFetch(input, init);
      const url = new URL(raw);
      calls.push({ url, init });
      const handler = routes[url.host + url.pathname];
      return handler ? handler({ url, init }) : json({ error: { code: 404 } }, 404);
    })
  );
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await mock.stop();
  delete process.env.USE_AIMOCK;
  delete process.env.AIMOCK_URL;
  cleanup();
});
beforeEach(() => {
  calls = [];
  mock.clearRequests();
  routes = {
    [`${GMAIL}/profile`]: () => json({ emailAddress: ME }),
    [`${GMAIL}/messages`]: () => json({ messages: MESSAGES.map((m) => ({ id: m.id })) }),
    [`${SITE}/`]: () =>
      new Response(SITE_HTML, { status: 200, headers: { "Content-Type": "text/html" } })
  };
  for (const m of MESSAGES) routes[`${GMAIL}/messages/${m.id}`] = () => json(m);
});

const guideLog = () =>
  db.select().from(t.activityLog).where(eq(t.activityLog.entityType, "voice_guide"));

describe("voice guide text", () => {
  it("caps what the agent reads at VOICE_GUIDE_MAX and never cuts mid-word", () => {
    expect(voiceGuide(null)).toBe("");
    expect(voiceGuide("  \n ")).toBe("");
    expect(voiceGuide("Short and warm.")).toBe("Short and warm.");
    const long = Array.from({ length: 200 }, (_, i) => `Point ${i} is about warmth.`).join("\n");
    const capped = voiceGuide(long);
    expect(capped.length).toBeLessThanOrEqual(VOICE_GUIDE_MAX);
    expect(capped.endsWith("warmth.")).toBe(true);
  });

  it("keeps only her own words from a sent reply", () => {
    const own = ownEmailText(REPLY);
    expect(own).toContain("Could we find thirty minutes next week?");
    expect(own).toContain("Warmly,\nSimone");
    expect(own).not.toContain("wrote:");
    expect(own).not.toContain("seed round");
  });

  it("reads website copy without the menu, footer or scripts", () => {
    const copy = websiteCopy(SITE_HTML);
    expect(copy).toContain("We’re a creative sustainability agency designed to shift culture.");
    expect(copy).not.toMatch(/Home|Series|console|©/);
  });

  it("builds one prompt within the size caps, led by the fixed first line", () => {
    const samples: VoiceSample[] = Array.from({ length: 20 }, (_, i) => ({
      id: `s${i}`,
      source: "gmail",
      label: `Email ${i}`,
      text: "word ".repeat(600)
    }));
    const { prompt, used } = buildVoicePrompt(samples);
    expect(prompt.startsWith(VOICE_PROMPT_LEAD)).toBe(true);
    expect(used.every((s) => s.text.length <= SAMPLE_MAX)).toBe(true);
    expect(used.reduce((n, s) => n + s.text.length, 0)).toBeLessThanOrEqual(SAMPLES_TOTAL_MAX);
    expect(used.length).toBeLessThan(samples.length);
    // Subjects and labels never go to the model.
    expect(prompt).not.toContain("Email 0");
  });

  it("makes the copy block for ChatGPT and Claude", () => {
    expect(copyBlock("")).toBe("");
    expect(copyBlock("Be warm.")).toBe(`${COPY_INTRO}\n\nBe warm.`);
  });
});

describe("voice guide actions", () => {
  it("reads an empty guide before anything is saved", async () => {
    expect(await A.getVoiceGuide.run({}, ctx())).toEqual({
      guide: "",
      sources: [],
      updatedAt: null,
      context: ""
    });
  });

  it("gathers the business profile and longer notes when Google isn't connected", async () => {
    await A.updateBusinessProfile.run(
      {
        mission: "Our mission is to rewrite the narrative around climate change.",
        story: "Cultured Matter develops and executes creative sustainability projects."
      },
      ctx()
    );
    await A.importNotes.run(
      {
        notes: [
          { title: "Series pitch", body: "The series follows a bold collaboration. ".repeat(8) },
          { title: "Groceries", body: "eggs, oat milk" }
        ]
      },
      ctx()
    );
    const r = await A.gatherVoiceSamples.run({}, ctx());
    expect(r.gmail).toBe("not_connected");
    expect(r.website).toBe("none");
    expect(r.samples.map((s) => s.id)).toEqual(
      expect.arrayContaining(["business:mission", "business:story"])
    );
    const notes = r.samples.filter((s) => s.source === "notes");
    expect(notes.map((s) => s.label)).toEqual(["Series pitch"]);
    expect(calls.filter((c) => c.url.host === "gmail.googleapis.com")).toHaveLength(0);
  });

  it("gathers her sent email and website once connected, leaving out mail to herself", async () => {
    await db.update(t.accounts).set({ scope: FULL_SCOPE }).where(eq(t.accounts.id, "acc1"));
    await A.updateBusinessProfile.run({ website: SITE }, ctx());

    const r = await A.gatherVoiceSamples.run({}, ctx());
    expect(r.gmail).toBe("included");
    expect(r.website).toBe("included");

    const gmail = r.samples.filter((s) => s.source === "gmail");
    expect(gmail.map((s) => s.id)).toEqual(["gmail:m1", "gmail:m4"]);
    expect(gmail[0].label).toBe("Re: Soliome intro");
    expect(gmail[0].text).not.toContain("seed round");
    expect(gmail[1].text).toContain("limited-edition drop");

    const site = r.samples.find((s) => s.source === "website");
    expect(site?.text).toContain("designed to shift culture");

    // Only the scopes the Google connection already has: Gmail reads, nothing else.
    const google = calls.filter((c) => c.url.host.endsWith("googleapis.com"));
    expect(google.every((c) => (c.init?.method ?? "GET") === "GET")).toBe(true);
    expect(calls.find((c) => c.url.pathname.endsWith("/messages"))?.url.searchParams.get("q")).toBe(
      "in:sent -in:chats newer_than:365d"
    );
  });

  it("still gathers the rest when Gmail and the website fail", async () => {
    routes[`${GMAIL}/messages`] = () => json({ error: {} }, 500);
    routes[`${SITE}/`] = () => new Response("down", { status: 503 });
    const r = await A.gatherVoiceSamples.run({}, ctx());
    expect(r.gmail).toBe("unavailable");
    expect(r.website).toBe("unavailable");
    expect(r.samples.some((s) => s.source === "business")).toBe(true);
  });

  it("builds the guide in one AI call from the samples she picked, and saves it", async () => {
    const gathered = await A.gatherVoiceSamples.run({}, ctx());
    // As the page does: notes start unticked.
    const picked = gathered.samples.filter((s) => s.source !== "notes");

    const r = await A.buildVoiceGuide.run({ samples: picked }, ctx());
    expect(r.guide).toMatch(/^Vocabulary:/);
    expect(r.guide).toContain("Warmly, Simone");
    expect(r.sources).toEqual(picked.map((s) => ({ source: s.source, label: s.label })));
    expect(r.updatedAt).toBeInstanceOf(Date);

    const requests = mock.getRequests();
    expect(requests).toHaveLength(1);
    const body = JSON.stringify(requests[0].body);
    expect(body).toContain("limited-edition drop");
    expect(body).not.toContain("Series pitch");

    const read = await A.getVoiceGuide.run({}, ctx());
    expect(read.guide).toBe(r.guide);
    expect(read.context).toBe(voiceGuide(r.guide));
    expect(await loadVoiceGuideContext(db)).toBe(read.context);

    const [entry] = await guideLog();
    expect(entry.summary).toBe(
      `Built the voice guide from ${picked.length} samples of her writing`
    );
    // Counts only: no subjects or text in the log.
    expect(JSON.stringify(entry.data)).not.toContain("Soliome");
    expect(entry.data).toMatchObject({ samples: { gmail: 2, website: 1 } });
  });

  it("keeps the current guide when the AI can't be reached", async () => {
    const before = await A.getVoiceGuide.run({}, ctx());
    process.env.AIMOCK_URL = "http://127.0.0.1:9";
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(
        A.buildVoiceGuide.run(
          { samples: [{ id: "x", source: "business", label: "Mission", text: "Hello there." }] },
          ctx()
        )
      ).rejects.toMatchObject({ code: "unavailable" });
    } finally {
      process.env.AIMOCK_URL = mock.url;
      vi.mocked(console.error).mockRestore();
    }
    expect(await A.getVoiceGuide.run({}, ctx())).toEqual(before);
  });

  it("refuses a build with no samples", async () => {
    await expect(A.buildVoiceGuide.run({ samples: [] }, ctx())).rejects.toThrow();
    expect(mock.getRequests()).toHaveLength(0);
  });

  it("saves her edits, keeps the sources, and clears on empty", async () => {
    const before = await A.getVoiceGuide.run({}, ctx());
    const edited = `${before.guide}\nDon't:\n- Don't use emoji.`;
    const r = await A.updateVoiceGuide.run({ guide: `  ${edited}\r\n` }, ctx());
    expect(r.changed).toBe(true);
    expect(r.guide).toBe(edited);
    expect(r.sources).toEqual(before.sources);

    expect((await A.updateVoiceGuide.run({ guide: edited }, ctx())).changed).toBe(false);

    const cleared = await A.updateVoiceGuide.run({ guide: " " }, ctx());
    expect(cleared.guide).toBe("");
    expect((await A.getVoiceGuide.run({}, ctx())).context).toBe("");

    const summaries = (await guideLog()).map((e) => e.summary);
    expect(summaries).toEqual(
      expect.arrayContaining([
        "Edited the voice guide",
        "Saved the voice guide (no changes)",
        "Cleared the voice guide"
      ])
    );
  });

  it("offers getVoiceGuide to the agent, but not the Settings-only actions", () => {
    const names = A.allActions.map((a) => a.name as string);
    expect(names).toContain("getVoiceGuide");
    expect(names).not.toContain("gatherVoiceSamples");
    expect(names).not.toContain("buildVoiceGuide");
    expect(names).not.toContain("updateVoiceGuide");
  });
});

describe("sent email samples", () => {
  it("skips mail only to herself and mail too short to learn from", () => {
    const me = new Set([ME]);
    expect(sentEmailSample(MESSAGES[1], me)).toBeNull();
    expect(sentEmailSample(MESSAGES[2], me)).toBeNull();
    expect(sentEmailSample(MESSAGES[3], me)?.text).toContain("Warmly,\nSimone");
  });
});
