// The Radar tabs and the cookies behind "new since last visit".

export const RADAR_VIEWS = [
  { value: "review", label: "To review", statuses: ["new", "starred"] },
  { value: "starred", label: "Starred", statuses: ["starred"] },
  { value: "shortlisted", label: "Shortlisted", statuses: ["shortlisted"] },
  { value: "passed", label: "Passed", statuses: ["passed"] },
  { value: "all", label: "All", statuses: undefined }
] as const satisfies readonly {
  value: string;
  label: string;
  statuses: readonly ("new" | "starred" | "shortlisted" | "passed")[] | undefined;
}[];

export type RadarView = (typeof RADAR_VIEWS)[number]["value"];

// Last time she looked at Radar, updated on every view.
export const RADAR_LAST_SEEN_COOKIE = "radar_last_seen";
// What "new" is measured against. Moves forward only when a visit starts after
// a 30-minute gap, so it stays put while she works through the list.
export const RADAR_BASELINE_COOKIE = "radar_baseline";
export const RADAR_SESSION_GAP_MS = 30 * 60 * 1000;
