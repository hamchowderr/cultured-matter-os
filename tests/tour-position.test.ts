import { describe, expect, it } from "vitest";

import { cardPosition, EDGE, GAP } from "@/lib/tour-position";

const phone = { width: 420, height: 912 };
const card = { width: 288, height: 212 };

const onScreen = (p: { top: number; left: number }, vp = phone) =>
  p.top >= EDGE &&
  p.left >= EDGE &&
  p.top + card.height <= vp.height - EDGE &&
  p.left + card.width <= vp.width - EDGE;

describe("cardPosition", () => {
  it("puts the card under a small element", () => {
    const p = cardPosition({ top: 72, left: 16, width: 388, height: 28 }, card, phone);
    expect(p.top).toBe(72 + 28 + GAP);
    expect(onScreen(p)).toBe(true);
  });

  it("goes above when there is no room below", () => {
    const p = cardPosition({ top: 792, left: 16, width: 388, height: 92 }, card, phone);
    expect(p.top).toBe(792 - GAP - card.height);
    expect(onScreen(p)).toBe(true);
  });

  it("keeps the card on screen for an element taller than the space around it", () => {
    // The Tasks card on Today at 420 wide, which pushed the registry card off the top.
    const top = cardPosition({ top: 186, left: 16, width: 388, height: 620 }, card, phone);
    expect(onScreen(top)).toBe(true);
    const tall = cardPosition({ top: 77, left: 16, width: 388, height: 900 }, card, phone);
    expect(onScreen(tall)).toBe(true);
  });

  it("slides sideways instead of leaving the screen at 360", () => {
    const narrow = { width: 360, height: 780 };
    const p = cardPosition({ top: 14, left: 300, width: 36, height: 28 }, card, narrow);
    expect(onScreen(p, narrow)).toBe(true);
  });

  it("honours the preferred side when it fits", () => {
    const desktop = { width: 1280, height: 900 };
    const p = cardPosition({ top: 830, left: 8, width: 240, height: 48 }, card, desktop, "top");
    expect(p.top).toBe(830 - GAP - card.height);
  });

  it("centres the card when there is no element", () => {
    const p = cardPosition(null, card, phone);
    expect(p.left).toBe((420 - 288) / 2);
    expect(onScreen(p)).toBe(true);
  });
});
