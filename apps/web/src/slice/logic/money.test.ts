import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";

describe("formatMoney", () => {
  it("formats the Req 6.7 examples exactly", () => {
    expect(formatMoney(1549, "USD", "en-US")).toBe("$15.49");
    expect(formatMoney(1099, "GBP", "en-GB")).toBe("£10.99");
    expect(formatMoney(1299, "EUR", "de-DE")).toBe("12,99\u00a0€");
    expect(formatMoney(100000, "JPY", "en-US")).toBe("¥1,000");
    expect(formatMoney(100050, "JPY", "en-US")).toBe("¥1,000.50");
    expect(formatMoney(1250, "KWD", "en-US")).toBe("KWD\u00a012.50");
  });

  it("formats zero", () => {
    expect(formatMoney(0, "USD", "en-US")).toBe("$0.00");
  });

  it("formats a negative amount with a leading minus", () => {
    expect(formatMoney(-1, "USD", "en-US")).toBe("-$0.01");
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    "throws RangeError for %s",
    (value) => {
      expect(() => formatMoney(value, "USD", "en-US")).toThrow(RangeError);
    },
  );
});
