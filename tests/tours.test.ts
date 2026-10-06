import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as A from "@/actions";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import {
  addSeen,
  getTour,
  PAGE_TOUR_IDS,
  parseSeen,
  resolveSteps,
  shouldAutoStartWelcome,
  tourForPath,
  TOURS,
  type TourDef
} from "@/lib/tours";
import { freshDb } from "./test-db";

const visible =
  (...ids: string[]) =>
  (target: string) =>
    ids.includes(target);

const welcome = getTour("welcome")!;

describe("resolveSteps", () => {
  it("points the pages step at the sidebar when it is visible", () => {
    const steps = resolveSteps(
      welcome,
      visible(
        "tour-nav",
        "tour-menu-button",
        "tour-search",
        "tour-bell",
        "tour-chat",
        "tour-start",
        "tour-account"
      )
    );
    expect(steps.map((s) => s.id)).toEqual([
      "tour-nav",
      "tour-search",
      "tour-bell",
      "tour-chat",
      "tour-start",
      "tour-account"
    ]);
    expect(steps[0].content).toContain(
      "Today, Chat, Inbox, Projects, People, Radar, Grants and Archive"
    );
  });

  it("points at the menu button on a phone and skips the hidden account menu", () => {
    const steps = resolveSteps(
      welcome,
      visible("tour-menu-button", "tour-search", "tour-bell", "tour-start")
    );
    expect(steps.map((s) => s.id)).toEqual([
      "tour-menu-button",
      "tour-search",
      "tour-bell",
      "tour-start"
    ]);
    expect(steps[0].content).toMatch(/^Tap here to open the menu/);
  });

  it("leaves out steps whose element is not on the page", () => {
    const today = getTour("today")!;
    const steps = resolveSteps(today, visible("today-heading", "today-stats", "today-tasks"));
    expect(steps.map((s) => s.id)).toEqual(["today-heading", "today-stats", "today-tasks"]);
  });

  it("returns no steps when nothing is visible", () => {
    expect(resolveSteps(getTour("radar")!, () => false)).toEqual([]);
  });

  it("never points two steps at the same element", () => {
    const tour: TourDef = {
      id: "today",
      label: "Today",
      steps: [
        { variants: [{ target: "a", title: "A", content: "first" }] },
        {
          variants: [
            { target: "b", title: "B", content: "hidden" },
            { target: "a", title: "A again", content: "second" }
          ]
        },
        { variants: [{ target: "c", title: "C", content: "third" }] }
      ]
    };
    expect(resolveSteps(tour, visible("a", "c")).map((s) => s.content)).toEqual(["first", "third"]);
  });

  it("keeps the step's side", () => {
    const steps = resolveSteps(welcome, visible("tour-account"));
    expect(steps).toEqual([expect.objectContaining({ id: "tour-account", side: "top" })]);
  });
});

describe("tour definitions", () => {
  it("has a tour for every screen in the sidebar, in sidebar order", () => {
    expect(TOURS.filter((t) => t.path).map((t) => t.id)).toEqual([...PAGE_TOUR_IDS]);
  });

  it("finds the tour for a screen, ignoring query and sub-paths", () => {
    expect(tourForPath("/radar")?.id).toBe("radar");
    expect(tourForPath("/grants/")?.id).toBe("grants");
    expect(tourForPath("/projects/abc")?.id).toBe("projects");
    expect(tourForPath("/settings")).toBeUndefined();
    expect(tourForPath("/")).toBeUndefined();
  });

  it("uses target ids that never match each other", () => {
    // The tour finds elements with [data-tour-step-id*=id], so one id inside another would
    // point a step at the wrong element.
    const targets = [
      ...new Set(TOURS.flatMap((t) => t.steps.flatMap((s) => s.variants.map((v) => v.target))))
    ];
    for (const a of targets) {
      for (const b of targets) {
        if (a !== b) expect(b.includes(a), `${b} contains ${a}`).toBe(false);
      }
    }
  });

  it("starts every page tour at its heading, which is always on the page", () => {
    for (const id of PAGE_TOUR_IDS) {
      const first = getTour(id)!.steps[0].variants[0].target;
      expect(first === `${id}-heading` || (id === "inbox" && first === "inbox-capture")).toBe(true);
    }
  });

  it("shows the Inbox camera button right after the capture box", () => {
    const targets = getTour("inbox")!.steps.map((s) => s.variants[0].target);
    expect(targets.slice(0, 2)).toEqual(["inbox-capture", "inbox-camera"]);
  });

  it("keeps each step short", () => {
    for (const tour of TOURS) {
      for (const step of tour.steps) {
        for (const v of step.variants) {
          expect(v.title.length, v.title).toBeLessThanOrEqual(30);
          expect(v.content.length, v.content).toBeLessThanOrEqual(140);
        }
      }
    }
  });
});

describe("first visit", () => {
  it("starts the welcome tour until it has been seen", () => {
    expect(shouldAutoStartWelcome([])).toBe(true);
    expect(shouldAutoStartWelcome(["radar"])).toBe(true);
    expect(shouldAutoStartWelcome(["welcome"])).toBe(false);
  });

  it("cleans the stored list", () => {
    expect(parseSeen(null)).toEqual([]);
    expect(parseSeen("welcome")).toEqual([]);
    expect(parseSeen(["welcome", "welcome", "nope", 3, "radar"])).toEqual(["welcome", "radar"]);
  });

  it("adds a tour once", () => {
    expect(addSeen([], "welcome")).toEqual(["welcome"]);
    expect(addSeen(["welcome"], "welcome")).toEqual(["welcome"]);
    expect(addSeen(["welcome"], "grants")).toEqual(["welcome", "grants"]);
  });
});

describe("markTourSeen", () => {
  let db: Database;
  let cleanup: () => void;
  const ctx = () => ({ db });

  beforeAll(async () => {
    ({ db, cleanup } = await freshDb());
    await db.insert(t.users).values([
      { id: "u1", name: "Simone", email: "simone@example.com" },
      { id: "u2", name: "Other", email: "other@example.com" }
    ]);
  });
  afterAll(() => cleanup());

  it("starts empty", async () => {
    const s = await A.getUserSettings.run({ userId: "u1" }, ctx());
    expect(s.toursSeen).toEqual([]);
  });

  it("remembers finished and skipped tours per user", async () => {
    await A.markTourSeen.run({ userId: "u1", tourId: "welcome", finished: false }, ctx());
    const r = await A.markTourSeen.run({ userId: "u1", tourId: "radar", finished: true }, ctx());
    expect(r.toursSeen).toEqual(["welcome", "radar"]);
    await A.markTourSeen.run({ userId: "u1", tourId: "radar", finished: true }, ctx());

    expect((await A.getUserSettings.run({ userId: "u1" }, ctx())).toursSeen).toEqual([
      "welcome",
      "radar"
    ]);
    expect((await A.getUserSettings.run({ userId: "u2" }, ctx())).toursSeen).toEqual([]);
  });

  it("keeps her other settings", async () => {
    await A.setDailyEmail.run({ userId: "u2", enabled: true }, ctx());
    await A.markTourSeen.run({ userId: "u2", tourId: "today", finished: true }, ctx());
    const s = await A.getUserSettings.run({ userId: "u2" }, ctx());
    expect(s.dailyEmail).toBe(true);
    expect(s.toursSeen).toEqual(["today"]);
  });

  it("logs a plain line in the Archive", async () => {
    const rows = await db
      .select({ summary: t.activityLog.summary })
      .from(t.activityLog)
      .where(eq(t.activityLog.action, "markTourSeen"));
    expect(rows.map((r) => r.summary)).toContain("Skipped the welcome tour");
    expect(rows.map((r) => r.summary)).toContain("Finished the Radar tour");
  });

  it("refuses an unknown tour", async () => {
    await expect(
      A.markTourSeen.run({ userId: "u1", tourId: "nope" as "radar", finished: true }, ctx())
    ).rejects.toThrow();
  });
});
