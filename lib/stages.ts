// Sources label stages differently ("Pre-Seed", "Series A(+)"); the Radar filter groups them.

export const STAGE_GROUPS = [
  "Pre-seed",
  "Seed",
  "Series A",
  "Series B+",
  "Growth",
  "Exit"
] as const;
export type StageGroup = (typeof STAGE_GROUPS)[number];

// Lower-cased raw values or prefixes (ending in "*") that belong to each group.
export const STAGE_MATCHERS: Record<StageGroup, string[]> = {
  "Pre-seed": ["pre-seed", "pre seed", "preseed"],
  Seed: ["seed"],
  "Series A": ["series a", "series a(+)"],
  "Series B+": ["series b*", "series c*", "series d*", "series e*", "series f*"],
  Growth: ["growth"],
  Exit: ["exit"]
};

export function stageGroup(stage: string | null | undefined): StageGroup | null {
  const s = stage?.trim().toLowerCase();
  if (!s) return null;
  for (const group of STAGE_GROUPS) {
    const hit = STAGE_MATCHERS[group].some((m) =>
      m.endsWith("*") ? s.startsWith(m.slice(0, -1)) : s === m
    );
    if (hit) return group;
  }
  return null;
}
