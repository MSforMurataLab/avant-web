import { describe, expect, it } from "vitest";

import { rollInt } from "./dice";

describe("rollInt", () => {
  it("returns values within inclusive range", () => {
    for (let i = 0; i < 200; i++) {
      const v = rollInt(1, 100);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});
