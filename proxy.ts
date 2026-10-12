import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

import { CHAT_DISABLED_MESSAGE, isChatEnabled, isChatProxyPath } from "@/lib/chat-enabled";

// Every app page needs a session. Signed-out visitors go to /sign-in.
// This is Better Auth's optimistic check: it only looks for the session cookie, so no request
// pays for a database lookup here. The real check runs where the data is read: the (app)
// layout, every server action (actions/define.ts toResult) and each guarded route handler.
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) return NextResponse.redirect(new URL("/sign-in", request.url));
  // No agent server configured: the chat's proxy routes say so instead of trying localhost.
  if (isChatProxyPath(request.nextUrl.pathname) && !isChatEnabled()) {
    return NextResponse.json({ error: CHAT_DISABLED_MESSAGE }, { status: 503 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except: Better Auth's own routes, cron routes (they check CRON_SECRET),
    // the public newsletter signup and webhook (they guard themselves), the iPhone capture
    // endpoint and the Apple Notes import (both check CAPTURE_TOKEN), the agent server's action
    // and ingestion job endpoints (they check AGENT_SERVICE_TOKEN), the calendar feed (the
    // token in its path is the key), the sign-in page, the install pieces (the generated app icons and the offline page; the
    // manifest and service worker are files), Next.js internals and static files (any path with
    // a file extension).
    "/((?!api/auth|api/cron|api/newsletter/signup|api/newsletter/webhook|api/capture|api/apple-notes$|api/agent/actions$|api/agent/actions/|api/agent/jobs/|api/calendar/|sign-in|icon/|apple-icon$|offline$|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"
  ]
};
