import { z } from "zod/v4";

import { draftGrantApplication } from "@/actions/grant-applications";
import { ActionError, type ActionContext, loggableError } from "@/actions/define";
import { capSource, PASTED_MAX, type DraftStep } from "@/lib/grant-application";
import { firecrawlClient, readUpload, UPLOAD_MAX_BYTES } from "@/lib/grant-draft";

// The grant page's "Draft application" (app/api/grants/[id]/draft): runs draftGrantApplication
// and streams its progress as newline-delimited JSON, one event a line:
//   {"type":"step","step":"reading_page"}   …then reading_documents / reading_upload / drafting
//   {"type":"done","status":"drafted"}       the draft is saved; the page refreshes
//   {"type":"error","message":"…"}           nothing was saved
// The body is JSON ({} to read the listing, or { questions } she pasted) or multipart with the
// application PDF she uploaded in `file`.

export type DraftEvent =
  | { type: "step"; step: DraftStep }
  | { type: "done"; status: string }
  | { type: "error"; message: string };

// The files she can upload, by extension, each with the one MIME type it must arrive as. Both
// must match: a renamed file or a mislabelled one is refused. Firecrawl's document parser reads
// .pdf, .docx and the older .doc (docs.firecrawl.dev/features/document-parsing).
export const UPLOAD_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword"
};

export function allowedUpload(file: { name: string; type: string }) {
  const ext = /\.[a-z0-9]+$/i.exec(file.name)?.[0].toLowerCase();
  return !!ext && UPLOAD_TYPES[ext] === file.type.toLowerCase();
}

const jsonBody = z.object({ questions: z.string().trim().max(PASTED_MAX).optional() });

type Parsed =
  { kind: "listing" } | { kind: "pasted"; questions: string } | { kind: "upload"; file: File };

async function parseRequest(request: Request): Promise<Parsed> {
  const type = request.headers.get("content-type") ?? "";
  if (type.startsWith("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) {
      throw new ActionError("invalid", "Choose the application PDF to upload.");
    }
    if (file.size > UPLOAD_MAX_BYTES) {
      throw new ActionError("invalid", "That file is over 4 MB. Paste the questions instead.");
    }
    if (!allowedUpload(file)) {
      throw new ActionError("invalid", "Upload a PDF or Word file.");
    }
    return { kind: "upload", file };
  }
  const body = jsonBody.safeParse(await request.json().catch(() => ({})));
  if (!body.success) throw new ActionError("invalid", "That’s too much text to paste at once.");
  return body.data.questions
    ? { kind: "pasted", questions: body.data.questions }
    : { kind: "listing" };
}

export type DraftStreamOptions = {
  ctx?: Omit<ActionContext, "onStep">;
  // Keeps the work alive after the response ends (the route passes after(), Vercel's
  // waitUntil), so a draft she has paid for still finishes and saves if she closes the page.
  keepAlive?: (work: Promise<void>) => void;
};

export function draftStream(
  request: Request,
  grantId: string,
  { ctx = {}, keepAlive }: DraftStreamOptions = {}
): Response {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  // Set when she goes away (the browser cancels the stream) or the stream is closed. From then
  // on events are dropped instead of throwing, so the draft itself is never cut short.
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      closed = true;
    }
  });
  const send = (e: DraftEvent) => {
    if (closed) return;
    try {
      controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
    } catch {
      closed = true;
    }
  };
  const close = () => {
    if (closed) return;
    closed = true;
    try {
      controller.close();
    } catch {
      // Already closed or errored by the runtime: nothing left to tell her.
    }
  };
  const onStep = (step: string) => send({ type: "step", step: step as DraftStep });

  const work = (async () => {
    try {
      const parsed = await parseRequest(request);
      let questions: {
        questions?: string;
        questionsFrom?: "pasted" | "upload";
        questionsTitle?: string;
      } = {};
      if (parsed.kind === "pasted")
        questions = { questions: parsed.questions, questionsFrom: "pasted" };
      if (parsed.kind === "upload") {
        const client = firecrawlClient();
        if (!client) {
          throw new ActionError(
            "unavailable",
            "Reading PDFs isn’t set up yet. Paste the questions instead."
          );
        }
        const text = await readUpload(
          {
            data: new Uint8Array(await parsed.file.arrayBuffer()),
            filename: parsed.file.name || "application.pdf",
            contentType: parsed.file.type || "application/pdf"
          },
          client,
          onStep
        );
        questions = {
          questions: capSource(text, PASTED_MAX),
          questionsFrom: "upload",
          questionsTitle: (parsed.file.name || "Your uploaded PDF").slice(0, 300)
        };
      }
      const result = await draftGrantApplication.run({ grantId, ...questions }, { ...ctx, onStep });
      send({ type: "done", status: result.application.status });
    } catch (e) {
      if (!(e instanceof ActionError)) console.error("grant draft failed", loggableError(e));
      send({
        type: "error",
        message: e instanceof ActionError ? e.message : "Something went wrong. Try again."
      });
    } finally {
      close();
    }
  })();
  keepAlive?.(work);

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no"
    }
  });
}
