import { describe, it, expect } from "vitest";

describe("utility functions", () => {
  it("should handle basic math correctly", () => {
    expect(0.1 + 0.2).toBeCloseTo(0.3);
  });

  it("should validate number formatting", () => {
    const formatNum = (n: number) => n.toFixed(2);
    expect(formatNum(10)).toBe("10.00");
    expect(formatNum(10.5)).toBe("10.50");
  });
});
