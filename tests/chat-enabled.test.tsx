import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatButton, ChatDock, ChatDockProvider } from "@/components/layout/chat-dock";
import { NavMain } from "@/components/layout/sidebar/nav-main";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CHAT_DISABLED_MESSAGE, isChatEnabled, isChatProxyPath } from "@/lib/chat-enabled";
import { getTour, resolveSteps } from "@/lib/tours";
import { proxy } from "@/proxy";

/**
 * The chat is hidden until the server has an agent (MASTRA_SERVER_URL). Without one the
 * proxy would try localhost:4111, which only exists on a developer's machine.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/today",
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  }
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

const off = () => {
  vi.stubEnv("MASTRA_SERVER_URL", "");
  vi.stubEnv("NODE_ENV", "production");
};
const on = () => {
  vi.stubEnv("MASTRA_SERVER_URL", "https://agent.example.com");
  vi.stubEnv("NODE_ENV", "production");
};

describe("isChatEnabled", () => {
  it("is on with an agent URL, or in development (the localhost fallback), and off otherwise", () => {
    expect(isChatEnabled({ MASTRA_SERVER_URL: "https://agent.example.com" })).toBe(true);
    expect(isChatEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(isChatEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(isChatEnabled({ NODE_ENV: "production", MASTRA_SERVER_URL: "  " })).toBe(false);
    expect(isChatEnabled({ NODE_ENV: "test" })).toBe(false);
  });

  it("knows the chat's proxy routes, and only those", () => {
    for (const p of [
      "/api/agent-controller/stream",
      "/api/agent-controller/threads/abc/messages",
      "/api/workspace/files",
      "/api/browser/screencast",
      "/api/images/1"
    ]) {
      expect(isChatProxyPath(p), p).toBe(true);
    }
    for (const p of ["/api/agent/actions", "/api/photos/1", "/api/agent-controllers", "/chat"]) {
      expect(isChatProxyPath(p), p).toBe(false);
    }
  });
});

describe("the proxy routes", () => {
  const request = (path: string) =>
    new NextRequest(`https://os.example.com${path}`, {
      headers: { cookie: "better-auth.session_token=abc.def" }
    });

  it("answer 503 with a clear message when no agent is configured", async () => {
    off();
    for (const path of ["/api/agent-controller/stream", "/api/workspace/files"]) {
      const res = proxy(request(path));
      expect(res.status, path).toBe(503);
      expect(await res.json()).toEqual({ error: CHAT_DISABLED_MESSAGE });
    }
    // Everything else is unchanged.
    expect(proxy(request("/today")).headers.get("x-middleware-next")).toBe("1");
  });

  it("pass through when an agent is configured", () => {
    on();
    const res = proxy(request("/api/agent-controller/stream"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});

function shell(enabled: boolean) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <SidebarProvider>
        <ChatDockProvider enabled={enabled} defaultOpen defaultWidth={400} writeActions={[]}>
          <NavMain />
          <ChatButton />
          <ChatDock />
        </ChatDockProvider>
      </SidebarProvider>
    </TooltipProvider>
  );
}

describe("the app shell", () => {
  it("shows no chat button, no dock and no Chat page when disabled", () => {
    const html = shell(false);
    expect(html).not.toContain('data-tour-step-id="tour-chat"');
    expect(html).not.toContain('aria-label="Assistant"');
    expect(html).not.toContain('href="/chat"');
    // The rest of the sidebar is there.
    expect(html).toContain('href="/today"');
  });

  it("is unchanged when enabled", () => {
    const html = shell(true);
    expect(html).toContain('data-tour-step-id="tour-chat"');
    expect(html).toContain('aria-label="Assistant"');
    expect(html).toContain('href="/chat"');
  });

  it("the welcome tour skips the chat step when the button is not there", () => {
    const welcome = getTour("welcome")!;
    const visibleIn = (html: string) => (target: string) =>
      html.includes(`data-tour-step-id="${target}"`) || target !== "tour-chat";
    expect(resolveSteps(welcome, visibleIn(shell(false))).map((s) => s.id)).not.toContain(
      "tour-chat"
    );
    expect(resolveSteps(welcome, visibleIn(shell(true))).map((s) => s.id)).toContain("tour-chat");
  });
});

describe("/chat", () => {
  it("is not found when disabled, and renders when enabled", async () => {
    const { default: ChatPage } = await import("@/app/(app)/chat/page");
    off();
    expect(() => ChatPage()).toThrow("NEXT_NOT_FOUND");
    on();
    expect(() => ChatPage()).not.toThrow();
  });
});
