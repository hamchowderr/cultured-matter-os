import { describe, expect, it } from "vitest";

import { CHAT_SUGGESTIONS, suggestionsFor } from "@/lib/chat-suggestions";

describe("page-aware chat suggestions", () => {
  it("gives each page its own starting points", () => {
    expect(suggestionsFor("/grants").map((s) => s.label)).toContain("Closing soon");
    expect(suggestionsFor("/radar").map((s) => s.label)).toContain("New on Radar");
    expect(suggestionsFor("/today").map((s) => s.label)).toContain("Plan my day");
  });

  it("covers a page's sub-routes", () => {
    expect(suggestionsFor("/archive/notes")).toEqual(suggestionsFor("/archive"));
    expect(suggestionsFor("/settings/business")).toEqual(suggestionsFor("/settings"));
  });

  it("falls back to the general set elsewhere", () => {
    expect(suggestionsFor("/chat")).toBe(CHAT_SUGGESTIONS);
    expect(suggestionsFor(null)).toBe(CHAT_SUGGESTIONS);
    // A prefix only matches a whole segment.
    expect(suggestionsFor("/todayish")).toBe(CHAT_SUGGESTIONS);
  });
});
