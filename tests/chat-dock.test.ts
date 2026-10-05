import { describe, expect, it } from "vitest";

import {
  CHAT_DOCK_DEFAULT,
  CHAT_DOCK_MAX,
  CHAT_DOCK_MIN,
  clampDockWidth,
  parseDockOpen,
  parseDockWidth
} from "@/lib/chat-dock";

describe("chat dock cookies", () => {
  it("starts open the first time, and stays closed once closed", () => {
    expect(parseDockOpen(undefined)).toBe(true);
    expect(parseDockOpen("true")).toBe(true);
    expect(parseDockOpen("false")).toBe(false);
  });

  it("remembers the width within its limits", () => {
    expect(parseDockWidth(undefined)).toBe(CHAT_DOCK_DEFAULT);
    expect(parseDockWidth("480")).toBe(480);
    expect(parseDockWidth("100")).toBe(CHAT_DOCK_MIN);
    expect(parseDockWidth("5000")).toBe(CHAT_DOCK_MAX);
    expect(parseDockWidth("wide")).toBe(CHAT_DOCK_DEFAULT);
    expect(clampDockWidth(401.6)).toBe(402);
  });
});
