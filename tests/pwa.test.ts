import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

import manifest from "@/app/manifest";


describe("web app manifest", () => {
  it("opens standalone on /today with 192 and 512 icons", () => {
    const m = manifest();
    expect(m.name).toBe("Cultured Matter");
    expect(m.start_url).toBe("/today");
    expect(m.display).toBe("standalone");
    const sizes = (m.icons ?? []).map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });
});

describe("proxy matcher and the install pieces", () => {
  it("lets the manifest, icons, service worker and offline page load signed-out", async () => {
    const { config } = await import("@/proxy");
    const re = new RegExp(`^${config.matcher[0]}$`);
    for (const path of [
      "/manifest.webmanifest",
      "/sw.js",
      "/icon/192",
      "/icon/512",
      "/apple-icon",
      "/offline"
    ]) {
      expect(re.test(path), path).toBe(false);
    }
    for (const path of ["/today", "/inbox", "/api/photos/abc", "/offline-notes", "/apple-iconx"]) {
      expect(re.test(path), path).toBe(true);
    }
  });
});

describe("service worker routing", () => {
  const source = readFileSync(fileURLToPath(new URL("../public/sw.js", import.meta.url)), "utf8");
  const context = vm.createContext({
    URL,
    self: { location: { origin: "https://cm.test" }, addEventListener: () => {} }
  });
  vm.runInContext(source, context);
  const strategyFor = context.strategyFor as (request: unknown) => string;

  const request = (
    path: string,
    { method = "GET", mode = "cors", headers = {} as Record<string, string> } = {}
  ) => ({
    url: path.startsWith("http") ? path : `https://cm.test${path}`,
    method,
    mode,
    headers: new Headers(headers)
  });

  it("never handles /api, non-GET, cross-origin or RSC data requests", () => {
    expect(strategyFor(request("/api/photos/1"))).toBe("network-only");
    expect(strategyFor(request("/api/auth/session", { mode: "navigate" }))).toBe("network-only");
    expect(strategyFor(request("/today", { method: "POST", mode: "navigate" }))).toBe(
      "network-only"
    );
    expect(strategyFor(request("https://other.test/x.js"))).toBe("network-only");
    expect(strategyFor(request("/today", { headers: { RSC: "1" } }))).toBe("network-only");
    expect(strategyFor(request("/today?_rsc=abc"))).toBe("network-only");
  });

  it("handles page navigations and hashed build assets", () => {
    expect(strategyFor(request("/today", { mode: "navigate" }))).toBe("page");
    expect(strategyFor(request("/_next/static/chunks/app.js"))).toBe("asset");
    expect(strategyFor(request("/icon/192"))).toBe("asset");
  });

  it("stores only pages the server marks storable", () => {
    const isStorablePage = context.isStorablePage as (response: unknown) => boolean;
    const response = (cacheControl: string, extra: Record<string, unknown> = {}) => ({
      ok: true,
      redirected: false,
      type: "basic",
      headers: new Headers({ "Cache-Control": cacheControl }),
      ...extra
    });
    expect(isStorablePage(response("private, no-cache, no-store, max-age=0"))).toBe(false);
    expect(isStorablePage(response("private, max-age=60"))).toBe(false);
    expect(isStorablePage(response("s-maxage=31536000", { redirected: true }))).toBe(false);
    expect(isStorablePage(response("s-maxage=31536000"))).toBe(true);
  });
});
