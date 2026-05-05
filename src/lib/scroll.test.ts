import { describe, expect, it } from "vitest";
import { computeScrollPercent } from "./scroll";

describe("computeScrollPercent", () => {
  it("returns 0 when there is no overflow", () => {
    expect(computeScrollPercent(0, 800, 800)).toBe(0);
  });

  it("returns 100 at bottom", () => {
    expect(computeScrollPercent(200, 1000, 800)).toBe(100);
  });

  it("returns midpoint", () => {
    expect(computeScrollPercent(200, 1200, 800)).toBe(50);
  });
});
