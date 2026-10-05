import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

// Every app page needs a session. Signed-out visitors go to /sign-in.
// This is Better Auth's optimistic check: it only looks for the session cookie, so no request
// pays for a database lookup here. The real check runs where the data is read: the (app)
// layout, every server action (actions/define.ts toResult) and each guarded route handler.
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) return NextResponse.redirect(new URL("/sign-in", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except: Better Auth's own routes, cron routes (they check CRON_SECRET),
    // the public newsletter signup and webhook (they guard themselves), the iPhone capture
    // endpoint and the Apple Notes import (both check CAPTURE_TOKEN), the calendar feed (the
    // token in its path is the key), the sign-in page, the install pieces (the generated app icons and the offline page; the
    // manifest and service worker are files), Next.js internals and static files (any path with
    // a file extension).
    "/((?!api/auth|api/cron|api/newsletter/signup|api/newsletter/webhook|api/capture|api/apple-notes$|api/calendar/|sign-in|icon/|apple-icon$|offline$|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"
  ]
};
