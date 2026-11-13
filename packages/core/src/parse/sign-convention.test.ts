import { describe, expect, it } from "vitest";
import { applySignConvention, detectSignConvention } from "./sign-convention";

describe("detectSignConvention (Req 6.1)", () => {
  it("chooses positive-out when most values are positive", () => {
    expect(detectSignConvention([1500, 2000, -500])).toEqual({
      convention: "positive-out",
      assumed: false,
    });
  });

  it("chooses negative-out when most values are negative", () => {
    expect(detectSignConvention([-1549, -1099, 125_000])).toEqual({
      convention: "negative-out",
      assumed: false,
    });
  });

  it("decides on a majority of one", () => {
    expect(detectSignConvention([5, 5, -5])).toEqual({
      convention: "positive-out",
      assumed: false,
    });
    expect(detectSignConvention([-5, -5, 5])).toEqual({
      convention: "negative-out",
      assumed: false,
    });
  });

  it("decides on a single value", () => {
    expect(detectSignConvention([100])).toEqual({ convention: "positive-out", assumed: false });
    expect(detectSignConvention([-100])).toEqual({ convention: "negative-out", assumed: false });
  });

  it("assumes positive-out on a tie", () => {
    expect(detectSignConvention([100, -100])).toEqual({
      convention: "positive-out",
      assumed: true,
    });
    expect(detectSignConvention([-1, 1, -2, 2])).toEqual({
      convention: "positive-out",
      assumed: true,
    });
  });

  it("assumes positive-out when there are no values", () => {
    expect(detectSignConvention([])).toEqual({ convention: "positive-out", assumed: true });
  });

  it("assumes positive-out when every value is zero", () => {
    expect(detectSignConvention([0, 0, 0])).toEqual({ convention: "positive-out", assumed: true });
  });

  it("does not count zeros", () => {
    expect(detectSignConvention([0, 0, 0, 0, -5])).toEqual({
      convention: "negative-out",
      assumed: false,
    });
    expect(detectSignConvention([0, 5, -5, 0])).toEqual({
      convention: "positive-out",
      assumed: true,
    });
  });

  it("counts values, not amounts: one large credit does not outweigh many small debits", () => {
    expect(detectSignConvention([-100, -100, -100, 1_000_000])).toEqual({
      convention: "negative-out",
      assumed: false,
    });
  });

  it("does not depend on the order of the values", () => {
    expect(detectSignConvention([-1, 2, 3])).toEqual(detectSignConvention([3, 2, -1]));
  });
});

describe("applySignConvention (Req 6.3-6.6)", () => {
  it("keeps the sign under positive-out", () => {
    expect(applySignConvention(1500, "positive-out")).toBe(1500);
    expect(applySignConvention(-1500, "positive-out")).toBe(-1500);
  });

  it("flips the sign under negative-out", () => {
    expect(applySignConvention(-1500, "negative-out")).toBe(1500);
    expect(applySignConvention(1500, "negative-out")).toBe(-1500);
  });

  it("stores money out as positive and money in as negative, for each of the four combinations", () => {
    const cases: Array<[number, "positive-out" | "negative-out", number]> = [
      [999, "positive-out", 999],
      [-999, "positive-out", -999],
      [-999, "negative-out", 999],
      [999, "negative-out", -999],
    ];
    for (const [raw, convention, stored] of cases) {
      expect(applySignConvention(raw, convention)).toBe(stored);
    }
  });

  it("keeps zero as 0 under both conventions, never -0 (Req 6.7)", () => {
    for (const convention of ["positive-out", "negative-out"] as const) {
      expect(Object.is(applySignConvention(0, convention), 0)).toBe(true);
      expect(Object.is(applySignConvention(-0, convention), 0)).toBe(true);
    }
  });

  it("handles the largest accepted values", () => {
    expect(applySignConvention(9_999_999_900, "negative-out")).toBe(-9_999_999_900);
    expect(applySignConvention(-9_999_999_900, "negative-out")).toBe(9_999_999_900);
  });
});
