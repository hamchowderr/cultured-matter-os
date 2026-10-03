import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";

// Every app page needs a session. Signed-out visitors go to /sign-in.
// Proxy runs on the Node.js runtime in Next 16, so this is a full session check against the
// database, not just a cookie-presence check.
export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.redirect(new URL("/sign-in", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except: Better Auth's own routes, cron routes (they check CRON_SECRET),
    // the public newsletter signup and webhook (they guard themselves), the iPhone capture
    // endpoint (it checks CAPTURE_TOKEN), the sign-in page, Next.js internals and static files
    // (any path with a file extension).
    "/((?!api/auth|api/cron|api/newsletter/signup|api/newsletter/webhook|api/capture|sign-in|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"
  ]
};
