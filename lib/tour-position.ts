// Where the guided-tour card goes, kept fully on screen. Adapted from the viewport-clamped fix in
// montgomery-civic-hub/components/ui/tour.tsx: the registry tour anchors the card with a Radix
// popover, which pushes it off the top or bottom of a phone when the highlighted element is tall.

export type Box = { top: number; left: number; width: number; height: number };
export type Side = "top" | "bottom" | "left" | "right";

// Smallest gap between the card and the screen edge, and between the card and its element.
export const EDGE = 12;
export const GAP = 10;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));

export function cardPosition(
  target: Box | null,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
  side: Side = "bottom"
): { top: number; left: number } {
  const { width: vw, height: vh } = viewport;
  const maxLeft = Math.max(EDGE, vw - card.width - EDGE);
  const maxTop = Math.max(EDGE, vh - card.height - EDGE);
  const fit = (top: number, left: number) => ({
    top: clamp(top, EDGE, maxTop),
    left: clamp(left, EDGE, maxLeft)
  });

  if (!target) return fit((vh - card.height) / 2, (vw - card.width) / 2);

  const bottom = target.top + target.height;
  const right = target.left + target.width;
  const centerX = target.left + target.width / 2 - card.width / 2;
  const centerY = target.top + target.height / 2 - card.height / 2;

  // The preferred side first, then the others; the first where the card fits beside the element.
  const order: Side[] = [
    side,
    ...(["bottom", "top", "right", "left"] as const).filter((s) => s !== side)
  ];
  for (const s of order) {
    if (s === "bottom" && bottom + GAP + card.height <= vh - EDGE && bottom + GAP >= EDGE)
      return fit(bottom + GAP, centerX);
    if (s === "top" && target.top - GAP - card.height >= EDGE && target.top - GAP <= vh - EDGE)
      return fit(target.top - GAP - card.height, centerX);
    if (s === "right" && right + GAP + card.width <= vw - EDGE) return fit(centerY, right + GAP);
    if (s === "left" && target.left - GAP - card.width >= EDGE)
      return fit(centerY, target.left - GAP - card.width);
  }

  // No room beside it (a tall element on a phone): pin the card to the bottom of the screen
  // when the element sits mostly in the top half, otherwise to the top.
  const visibleTop = Math.max(target.top, 0);
  const visibleBottom = Math.min(bottom, vh);
  const middle = (visibleTop + visibleBottom) / 2;
  return fit(middle <= vh / 2 ? vh - card.height - EDGE : EDGE, centerX);
}
