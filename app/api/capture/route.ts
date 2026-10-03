import { handleCapture } from "@/lib/capture";

// iPhone Shortcut capture. Public in proxy.ts: it authenticates with the CAPTURE_TOKEN bearer
// key instead of a session. See docs/iphone-shortcut.md.
export async function POST(request: Request) {
  return handleCapture(request);
}
