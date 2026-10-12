import { NextRequest } from "next/server";
import {
  getRedirectUrl,
  unstable_doesMiddlewareMatch as doesProxyMatch
} from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";

import { config, proxy } from "@/proxy";

const request = (path: string, cookie?: string) =>
  new NextRequest(`https://os.example.com${path}`, {
    headers: cookie ? { cookie } : undefined
  });

describe("proxy", () => {
  it("sends a visitor with no session cookie to /sign-in", () => {
    const res = proxy(request("/today"));
    expect(getRedirectUrl(res)).toBe("https://os.example.com/sign-in");
  });

  it("lets a request with a session cookie through without a database lookup", () => {
    const res = proxy(request("/today", "better-auth.session_token=abc.def"));
    expect(getRedirectUrl(res)).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("accepts the __Secure- cookie Better Auth sets over https", () => {
    const res = proxy(request("/inbox", "__Secure-better-auth.session_token=abc.def"));
    expect(getRedirectUrl(res)).toBeNull();
  });

  it("ignores unrelated cookies", () => {
    const res = proxy(request("/radar", "sidebar_state=true"));
    expect(getRedirectUrl(res)).toBe("https://os.example.com/sign-in");
  });

  it("runs on app pages and leaves the public routes alone", () => {
    for (const url of ["/today", "/inbox", "/radar", "/settings", "/api/photos/1"]) {
      expect(doesProxyMatch({ config, url }), url).toBe(true);
    }
    for (const url of [
      "/sign-in",
      "/api/auth/get-session",
      "/api/cron/daily-summary",
      "/api/agent/jobs/gmailReplyCheck",
      "/api/agent/jobs/ingestSource",
      "/api/newsletter/signup",
      "/api/capture",
      "/api/apple-notes",
      "/api/calendar/abc.ics",
      "/offline",
      "/manifest.webmanifest",
      "/_next/static/chunk.js"
    ]) {
      expect(doesProxyMatch({ config, url }), url).toBe(false);
    }
  });
});
