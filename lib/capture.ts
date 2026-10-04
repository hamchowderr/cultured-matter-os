import { createHash, timingSafeEqual } from "node:crypto";
import { get, put } from "@vercel/blob";
import busboy from "busboy";
import { eq } from "drizzle-orm";

import { type ActionContext, ActionError } from "@/actions/define";
import { createCapture } from "@/actions/work";
import { captures } from "@/db/schema";

// Vercel caps a function request body at 4.5 MB, so a larger photo never reaches this code.
// The same limit here gives a clear message when running elsewhere.
export const MAX_PHOTO_BYTES = 4.5 * 1024 * 1024;
// Same limit as createCapture's body.
const MAX_CAPTION = 10_000;

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

// The key comes from the Authorization header or, more reliably from a Shortcut, a "key" field
// in the Form or JSON body. Pasting into a header can carry hidden characters that make iOS drop
// the request; a body field tolerates them. "Bearer " and surrounding whitespace are ignored.
function authorized(request: Request, bodyKey?: string) {
  const expected = process.env.CAPTURE_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const given = match?.[1] ?? bodyKey?.replace(/^\s*Bearer\s+/i, "");
  return !!given?.trim() && keyMatches(given.trim(), expected);
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

type Parsed = { body: string; photo: Blob | null; key?: string; fields: FieldShape[] };
// What arrived, without any content: logged when nothing usable was found.
type FieldShape = { name: string; kind: "text" | "file"; type?: string; size: number };

const TEXT_FIELDS = ["text", "body"];
const PHOTO_FIELDS = ["photo", "file", "image"];

// A file part becomes the photo when it is an image; otherwise it is read as text, because
// Shortcuts sometimes sends a text variable as a small file inside a Form.
async function fromFile(file: Blob): Promise<{ text?: string; photo?: Blob }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = (file.type || "").toLowerCase();
  const sniffed = type.startsWith("image/") ? type : sniffImage(bytes);
  if (sniffed) return { photo: new Blob([bytes], { type: sniffed }) };
  return { text: new TextDecoder().decode(bytes) };
}

type FormEntry = [name: string, value: string | Blob];

// Form bodies. Multipart goes through busboy: the platform's Request.formData() rejects the
// multipart bodies iPhone Shortcuts sends with photos ("Failed to parse body as FormData").
function readForm(type: string, raw: Uint8Array): Promise<FormEntry[]> {
  if (!type.includes("multipart/form-data")) {
    const params = new URLSearchParams(new TextDecoder().decode(raw));
    return Promise.resolve([...params.entries()]);
  }
  return new Promise((resolve, reject) => {
    const entries: FormEntry[] = [];
    const parser = busboy({ headers: { "content-type": type } });
    parser.on("field", (name, value) => entries.push([name, value]));
    parser.on("file", (name, stream, info) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () =>
        entries.push([name, new Blob([Buffer.concat(chunks)], { type: info.mimeType })])
      );
    });
    parser.on("close", () => resolve(entries));
    parser.on("error", reject);
    parser.end(Buffer.from(raw));
  });
}

// The Shortcut can send JSON ({"text": "..."}), a Form (fields "text" and "photo"), plain text,
// or the photo itself as the whole request body ("File"). The body is already read in full.
async function parse(type: string, raw: Uint8Array): Promise<Parsed> {
  if (type.includes("application/json")) {
    const json = JSON.parse(new TextDecoder().decode(raw)) as Record<string, unknown> | null;
    const value = TEXT_FIELDS.map((k) => json?.[k]).find((v) => v != null);
    const fields = Object.entries(json ?? {}).map(([name, v]) => ({
      name,
      kind: "text" as const,
      size: String(v ?? "").length
    }));
    const key = typeof json?.key === "string" ? json.key : undefined;
    return { body: value == null ? "" : String(value), photo: null, key, fields };
  }
  if (type.includes("multipart/form-data") || type.includes("application/x-www-form-urlencoded")) {
    let body = "";
    let photo: Blob | null = null;
    let key: string | undefined;
    const fields: FieldShape[] = [];
    for (const [name, value] of await readForm(type, raw)) {
      const field = name.toLowerCase();
      if (typeof value === "string") {
        fields.push({ name, kind: "text", size: value.length });
        if (name.toLowerCase() === "key") key = value;
        else if (TEXT_FIELDS.includes(name.toLowerCase()) && !body) body = value;
        continue;
      }
      fields.push({ name, kind: "file", type: value.type, size: value.size });
      if (value.size === 0) continue;
      if (field === "key") {
        key = new TextDecoder().decode(await value.arrayBuffer());
      } else if (TEXT_FIELDS.includes(field)) {
        const read = await fromFile(value);
        if (read.photo && !photo) photo = read.photo;
        if (read.text && !body) body = read.text;
      } else if (PHOTO_FIELDS.includes(field) && !photo) {
        // A non-image here stays as sent, so it is refused as "not a photo" below.
        photo = (await fromFile(value)).photo ?? value;
      }
    }
    return { body, photo, key, fields };
  }
  if (raw.length === 0) return { body: "", photo: null, fields: [] };
  const read = await fromFile(new Blob([raw as BlobPart], { type: type.split(";")[0] }));
  return {
    body: read.text ?? "",
    photo: read.photo ?? null,
    fields: [{ name: "(whole body)", kind: "file", type, size: raw.length }]
  };
}

type Stored = { ok: true; pathname: string } | { ok: false; status: number; message: string };

// Saves a photo to the private Blob store under captures/. The iPhone Shortcut endpoint and the
// Inbox camera button both store photos through here.
async function storePhoto(photo: Blob, upload: Upload = put, tooBigHint: string): Promise<Stored> {
  const contentType = (photo.type || "").toLowerCase();
  if (!contentType.startsWith("image/")) {
    return { ok: false, status: 415, message: "That file isn't a photo." };
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return { ok: false, status: 413, message: `That photo is too big. ${tooBigHint}` };
  }
  const ext = EXT[contentType] ?? "jpg";
  try {
    const stored = await upload(`captures/photo.${ext}`, photo, {
      access: "private",
      addRandomSuffix: true,
      contentType
    });
    return { ok: true, pathname: stored.pathname };
  } catch (e) {
    console.error("Capture photo upload failed", e);
    return { ok: false, status: 502, message: "Couldn't save the photo. Try again in a minute." };
  }
}

export async function handleCapture(request: Request, deps: CaptureDeps = {}) {
  // Read the whole request before answering. Replying while the iPhone is still sending makes
  // iOS report "network connection lost" instead of showing the reply.
  const raw = new Uint8Array(await request.arrayBuffer().catch(() => new ArrayBuffer(0)));
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  let parsed: Parsed | null = null;
  let parseError: unknown;
  try {
    parsed = await parse(type, raw);
  } catch (e) {
    parseError = e;
  }
  if (!authorized(request, parsed?.key)) {
    return text("Unauthorized. Check the key in your Shortcut.", 401);
  }
  if (!parsed) {
    const error = String(parseError);
    console.warn("Capture: could not parse request", { type, bytes: raw.length, error });
    return text("Couldn't read that. Send text or a photo.", 400);
  }

  const body = parsed.body.trim();
  const photo = parsed.photo;
  if (!body && !photo) {
    console.warn("Capture: nothing to capture", { type, bytes: raw.length, fields: parsed.fields });
    return text("Nothing to capture. Send text or a photo.", 400);
  }

  let imagePath: string | undefined;
  if (photo) {
    const stored = await storePhoto(photo, deps.upload, "Add a Resize Image step to the Shortcut.");
    if (!stored.ok) return text(stored.message, stored.status);
    imagePath = stored.pathname;
  }

  await createCapture.run(
    { body: body || "Photo from iPhone", imagePath, source: "iphone" },
    deps.ctx
  );
  // Plain text so the Shortcut's "Show Result" step reads it out as is.
  return text("Saved to your Inbox.", 201);
}

// A photo taken or picked with the Inbox camera button. The caller is a signed-in server action,
// so no capture key is involved. The browser has already resized it and turned it into a JPEG;
// one it could not convert (HEIC in a desktop browser without HEIC support) arrives as picked.
export async function captureInboxPhoto(form: FormData, deps: CaptureDeps = {}) {
  const photo = form.get("photo");
  const caption = form.get("caption");
  if (!(photo instanceof Blob) || photo.size === 0) {
    throw new ActionError("invalid", "Choose a photo first.");
  }
  const body = typeof caption === "string" ? caption.trim().slice(0, MAX_CAPTION) : "";
  const stored = await storePhoto(photo, deps.upload, "Try a smaller one.");
  if (!stored.ok) {
    throw new ActionError(stored.status === 502 ? "unavailable" : "invalid", stored.message);
  }
  return createCapture.run(
    { body: body || "Photo", imagePath: stored.pathname, source: "web" },
    deps.ctx
  );
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
