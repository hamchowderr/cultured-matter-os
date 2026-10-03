import { desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/db";
import * as t from "@/db/schema";
import { handleCapture, serveCapturePhoto } from "@/lib/capture";
import { freshDb } from "./test-db";

// Never touch the real Blob store: the upload is injected, and the module is mocked as a guard.
vi.mock("@vercel/blob", () => ({
  put: vi.fn(() => {
    throw new Error("real Blob upload called in a test");
  }),
  get: vi.fn()
}));

let db: Database;
let cleanup: () => void;
const KEY = "test-capture-key-0123456789";
const URL_ = "http://localhost/api/capture";

const upload = vi.fn(async (pathname: string) => ({
  pathname: pathname.replace("photo.", "photo-Ab12Cd34."),
  url: `https://store.private.blob.vercel-storage.com/${pathname}`,
  downloadUrl: "",
  contentType: "image/jpeg",
  contentDisposition: "",
  etag: '"x"'
}));
const deps = () => ({ ctx: { db }, upload: upload as never });

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
  process.env.CAPTURE_TOKEN = KEY;
});
afterAll(() => {
  delete process.env.CAPTURE_TOKEN;
  cleanup();
});
// Captures are ordered by a millisecond timestamp; keep each test's capture strictly newer.
beforeEach(async () => {
  upload.mockClear();
  await new Promise((r) => setTimeout(r, 5));
});

function post(body: BodyInit | null, headers: Record<string, string> = {}) {
  return new Request(URL_, { method: "POST", body, headers });
}
const auth = { Authorization: `Bearer ${KEY}` };
const latest = async () =>
  (await db.select().from(t.captures).orderBy(desc(t.captures.createdAt)).limit(1))[0];
const count = async () => (await db.select().from(t.captures)).length;

describe("iPhone capture endpoint", () => {
  it("refuses a missing key, a wrong key and a non-bearer header with 401", async () => {
    const before = await count();
    const json = { "Content-Type": "application/json" };
    const body = JSON.stringify({ text: "Should not land" });
    for (const headers of [
      json,
      { ...json, Authorization: "Bearer wrong-key" },
      { ...json, Authorization: KEY },
      { ...json, Authorization: `Bearer ${KEY}x` }
    ]) {
      const res = await handleCapture(post(body, headers), deps());
      expect(res.status).toBe(401);
    }
    expect(await count()).toBe(before);
  });

  it("refuses everything when CAPTURE_TOKEN is not set", async () => {
    delete process.env.CAPTURE_TOKEN;
    const res = await handleCapture(
      post(JSON.stringify({ text: "x" }), { ...auth, "Content-Type": "application/json" }),
      deps()
    );
    process.env.CAPTURE_TOKEN = KEY;
    expect(res.status).toBe(401);
  });

  it("captures typed text sent as JSON and logs it", async () => {
    const res = await handleCapture(
      post(JSON.stringify({ text: "  Call the mycelium lab  " }), {
        ...auth,
        "Content-Type": "application/json"
      }),
      deps()
    );
    expect(res.status).toBe(201);
    expect(await res.text()).toBe("Saved to your Inbox.");

    const capture = await latest();
    expect(capture).toMatchObject({
      body: "Call the mycelium lab",
      imagePath: null,
      filedAt: null
    });
    const [log] = await db
      .select()
      .from(t.activityLog)
      .where(eq(t.activityLog.entityId, capture.id));
    expect(log).toMatchObject({
      action: "createCapture",
      entityType: "capture",
      summary: 'Captured "Call the mycelium lab" from the iPhone',
      data: { source: "iphone", photo: false }
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it("captures dictated text sent as a Form field", async () => {
    const form = new FormData();
    form.set("text", "Remind me to send the deck to Jordan on Friday");
    const res = await handleCapture(post(form, auth), deps());
    expect(res.status).toBe(201);
    expect((await latest()).body).toBe("Remind me to send the deck to Jordan on Friday");
  });

  it("reads dictated text that Shortcuts attached to the Form as a file", async () => {
    const form = new FormData();
    form.set("text", new Blob(["Call Kwaku about Soliome"], { type: "text/plain" }), "text.txt");
    const res = await handleCapture(post(form, auth), deps());
    expect(res.status).toBe(201);
    expect((await latest()).body).toBe("Call Kwaku about Soliome");
  });

  it("captures plain text sent as the whole body", async () => {
    const res = await handleCapture(
      post("Idea: packaging episode", { ...auth, "Content-Type": "text/plain" }),
      deps()
    );
    expect(res.status).toBe(201);
    expect((await latest()).body).toBe("Idea: packaging episode");
  });

  it("stores a Form photo privately in Blob and links it on the capture", async () => {
    const form = new FormData();
    form.set(
      "photo",
      new File([new Uint8Array([0xff, 0xd8, 0xff])], "IMG_1.jpg", { type: "image/jpeg" })
    );
    form.set("text", "Shelf at Whole Foods");
    const res = await handleCapture(post(form, auth), deps());
    expect(res.status).toBe(201);

    expect(upload).toHaveBeenCalledTimes(1);
    const [pathname, , options] = upload.mock.calls[0] as unknown as [string, Blob, object];
    expect(pathname).toBe("captures/photo.jpg");
    expect(options).toMatchObject({
      access: "private",
      addRandomSuffix: true,
      contentType: "image/jpeg"
    });

    const capture = await latest();
    expect(capture).toMatchObject({
      body: "Shelf at Whole Foods",
      imagePath: "captures/photo-Ab12Cd34.jpg"
    });
    const [log] = await db
      .select()
      .from(t.activityLog)
      .where(eq(t.activityLog.entityId, capture.id));
    expect(log.summary).toBe("Captured a photo from the iPhone");
    expect(log.data).toEqual({ source: "iphone", photo: true });
  });

  it("captures a photo sent as the whole body, with a default caption", async () => {
    const res = await handleCapture(
      post(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { ...auth, "Content-Type": "image/png" }),
      deps()
    );
    expect(res.status).toBe(201);
    expect(upload.mock.calls[0][0]).toBe("captures/photo.png");
    expect(await latest()).toMatchObject({
      body: "Photo from iPhone",
      imagePath: "captures/photo-Ab12Cd34.png"
    });
  });

  it("recognises a JPEG sent as a generic file", async () => {
    const res = await handleCapture(
      post(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), {
        ...auth,
        "Content-Type": "application/octet-stream"
      }),
      deps()
    );
    expect(res.status).toBe(201);
    expect(upload.mock.calls[0][0]).toBe("captures/photo.jpg");
    expect((upload.mock.calls[0] as unknown as [string, Blob, object])[2]).toMatchObject({
      contentType: "image/jpeg"
    });
  });

  it("answers 502 and saves nothing when the photo upload fails", async () => {
    const before = await count();
    const failing = vi.fn(async () => {
      throw new Error("store unavailable");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const form = new FormData();
    form.set(
      "photo",
      new File([new Uint8Array([0xff, 0xd8, 0xff])], "a.jpg", { type: "image/jpeg" })
    );
    const res = await handleCapture(post(form, auth), { ctx: { db }, upload: failing as never });
    spy.mockRestore();
    expect(res.status).toBe(502);
    expect(await count()).toBe(before);
  });

  it("rejects empty captures and non-image files without storing anything", async () => {
    const before = await count();
    const empty = await handleCapture(
      post(JSON.stringify({ text: "   " }), { ...auth, "Content-Type": "application/json" }),
      deps()
    );
    expect(empty.status).toBe(400);

    const form = new FormData();
    form.set("photo", new File(["hello"], "notes.txt", { type: "text/plain" }));
    const notImage = await handleCapture(post(form, auth), deps());
    expect(notImage.status).toBe(415);

    expect(upload).not.toHaveBeenCalled();
    expect(await count()).toBe(before);
  });
});

describe("photo serving", () => {
  it("streams the stored photo for a capture and 404s for one without a photo", async () => {
    const form = new FormData();
    form.set(
      "photo",
      new File([new Uint8Array([0xff, 0xd8, 0xff])], "a.jpg", { type: "image/jpeg" })
    );
    await handleCapture(post(form, auth), deps());
    const withPhoto = await latest();

    const read = vi.fn(async () => ({
      statusCode: 200 as const,
      stream: new Blob([new Uint8Array([1, 2, 3])]).stream(),
      headers: new Headers(),
      blob: { contentType: "image/jpeg", etag: '"e1"' }
    }));
    const res = await serveCapturePhoto(new Request("http://localhost/x"), withPhoto.id, {
      ctx: { db },
      read: read as never
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(read).toHaveBeenCalledWith(
      withPhoto.imagePath,
      expect.objectContaining({ access: "private" })
    );

    await handleCapture(
      post(JSON.stringify({ text: "No photo" }), { ...auth, "Content-Type": "application/json" }),
      deps()
    );
    const noPhoto = await latest();
    const missing = await serveCapturePhoto(new Request("http://localhost/x"), noPhoto.id, {
      ctx: { db },
      read: read as never
    });
    expect(missing.status).toBe(404);
  });
});

describe("proxy matcher", () => {
  it("leaves /api/capture public and keeps photos behind sign-in", async () => {
    const { config } = await import("@/proxy");
    const re = new RegExp(`^${config.matcher[0]}$`);
    expect(re.test("/api/capture")).toBe(false);
    expect(re.test("/api/photos/abc")).toBe(true);
    expect(re.test("/inbox")).toBe(true);
  });
});
