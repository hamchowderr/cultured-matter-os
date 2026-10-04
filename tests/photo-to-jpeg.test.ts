import { describe, expect, it } from "vitest";

import { fitWithin, MAX_EDGE } from "@/lib/photo-to-jpeg";

describe("fitWithin", () => {
  it("shrinks an iPhone photo so the long edge is the maximum, keeping the shape", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: MAX_EDGE, height: 1536 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1536, height: MAX_EDGE });
    expect(fitWithin(8064, 6048)).toEqual({ width: MAX_EDGE, height: 1536 });
  });

  it("never enlarges a small photo", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(MAX_EDGE, 10)).toEqual({ width: MAX_EDGE, height: 10 });
  });

  it("keeps at least one pixel on a very thin image", () => {
    expect(fitWithin(10_000, 1)).toEqual({ width: MAX_EDGE, height: 1 });
  });
});
