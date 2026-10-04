import { handleNotesImport } from "@/lib/apple-notes";

// Apple Notes import from a Shortcut: one note or a batch per request, into the Notes archive.
// Public in proxy.ts: it authenticates with the CAPTURE_TOKEN key instead of a session.
// See docs/apple-notes-shortcut.md.
export async function POST(request: Request) {
  return handleNotesImport(request);
}
