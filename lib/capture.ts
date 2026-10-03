import { createHash, timingSafeEqual } from "node:crypto";
import { get, put } from "@vercel/blob";
import { eq } from "drizzle-orm";

import type { ActionContext } from "@/actions/define";
import { createCapture } from "@/actions/work";
import { captures } from "@/db/schema";

// Vercel caps a function request body at 4.5 MB, so a larger photo never reaches this code.
// The same limit here gives a clear message when running elsewhere.
export const MAX_PHOTO_BYTES = 4.5 * 1024 * 1024;

type Upload = typeof put;
export type CaptureDeps = { ctx?: ActionContext; upload?: Upload };

const text = (message: string, status: number) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

// Constant-time compare. Hashing first gives both sides the same length, so the length of the
// real key is not leaked either.
function keyMatches(given: string, expected: string) {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function authorized(request: Request) {
  const expected = process.env.CAPTURE_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return !!match && keyMatches(match[1].trim(), expected);
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/webp": "webp",
  "image/gif": "gif"
};

// A file sent without an image Content-Type: recognise the common photo formats by their
// first bytes.
function sniffImage(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  const brand = new TextDecoder().decode(b.subarray(4, 12));
  if (brand === "ftypheic" || brand === "ftypheix" || brand === "ftypmif1") return "image/heic";
  return null;
}

type Parsed = { body: string; photo: Blob | null };

// The Shortcut can send JSON ({"text": "..."}), a Form (fields "text" and "photo"), plain text,
// or the photo itself as the whole request body ("File").
async function parse(request: Request): Promise<Parsed> {
  const type = (request.headers.get("content-type") ?? "").toLowerCase();

  if (type.includes("application/json")) {
    const json = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const value = json?.text ?? json?.body;
    return { body: typeof value === "string" ? value : "", photo: null };
  }
  if (type.includes("multipart/form-data") || type.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    const value = form.get("text") ?? form.get("body");
    const photo = form.get("photo") ?? form.get("file") ?? form.get("image");
    return {
      body: typeof value === "string" ? value : "",
      photo: photo instanceof Blob && photo.size > 0 ? photo : null
    };
  }
  if (type.startsWith("image/")) {
    const photo = await request.blob();
    return { body: "", photo: photo.size > 0 ? photo : null };
  }
  if (type.includes("application/octet-stream")) {
    const bytes = new Uint8Array(await request.arrayBuffer());
    const sniffed = sniffImage(bytes);
    if (sniffed) return { body: "", photo: new Blob([bytes], { type: sniffed }) };
    return { body: new TextDecoder().decode(bytes), photo: null };
  }
  return { body: await request.text(), photo: null };
}

export async function handleCapture(request: Request, deps: CaptureDeps = {}) {
  if (!authorized(request)) return text("Unauthorized. Check the key in your Shortcut.", 401);

  let parsed: Parsed;
  try {
    parsed = await parse(request);
  } catch {
    return text("Couldn't read that. Send text or a photo.", 400);
  }

  const body = parsed.body.trim();
  const photo = parsed.photo;
  if (!body && !photo) return text("Nothing to capture. Send text or a photo.", 400);

  let imagePath: string | undefined;
  if (photo) {
    const contentType = (photo.type || "").toLowerCase();
    if (!contentType.startsWith("image/")) return text("That file isn't a photo.", 415);
    if (photo.size > MAX_PHOTO_BYTES) {
      return text("That photo is too big. Add a Resize Image step to the Shortcut.", 413);
    }
    const upload = deps.upload ?? put;
    const ext = EXT[contentType] ?? "jpg";
    try {
      const stored = await upload(`captures/photo.${ext}`, photo, {
        access: "private",
        addRandomSuffix: true,
        contentType
      });
      imagePath = stored.pathname;
    } catch (e) {
      console.error("Capture photo upload failed", e);
      return text("Couldn't save the photo. Try again in a minute.", 502);
    }
  }

  await createCapture.run(
    { body: body || "Photo from iPhone", imagePath, source: "iphone" },
    deps.ctx
  );
  // Plain text so the Shortcut's "Show Result" step reads it out as is.
  return text("Saved to your Inbox.", 201);
}

// Streams a capture's photo from the private Blob store. The caller checks the session first.
// Only a pathname recorded on a capture can be read, never one taken from the request.
export async function serveCapturePhoto(
  request: Request,
  captureId: string,
  deps: { ctx?: ActionContext; read?: typeof get } = {}
) {
  const db = deps.ctx?.db ?? (await import("@/db")).db;
  const [row] = await db
    .select({ imagePath: captures.imagePath })
    .from(captures)
    .where(eq(captures.id, captureId));
  if (!row?.imagePath) return text("Not found", 404);

  const result = await (deps.read ?? get)(row.imagePath, {
    access: "private",
    ifNoneMatch: request.headers.get("if-none-match") ?? undefined
  });
  if (!result) return text("Not found", 404);

  if (result.statusCode === 304) {
    return new Response(null, {
      status: 304,
      headers: { ETag: result.blob.etag, "Cache-Control": "private, no-cache" }
    });
  }
  return new Response(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      "X-Content-Type-Options": "nosniff",
      ETag: result.blob.etag,
      "Cache-Control": "private, no-cache"
    }
  });
}
