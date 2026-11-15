import fc from "fast-check";
import { describe, it } from "vitest";
import { formatMoney } from "./money";

const MAX_MINOR = 999_999_9900;

const amountArb = fc.integer({ min: -MAX_MINOR, max: MAX_MINOR });

describe("money properties", () => {
  it("P9: money is exact in en-US", () => {
    fc.assert(
      fc.property(amountArb, (n) => {
        const abs = Math.abs(n);
        const expected = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
        const out = formatMoney(n, "USD", "en-US");
        const stripped = out.replace(/[$,-]/g, "");
        return stripped === expected && out.startsWith("-") === n < 0;
      }),
    );
  });

  it("P10: money keeps minor units", () => {
    fc.assert(
      fc.property(
        amountArb,
        fc.constantFrom("JPY", "KWD", "EUR", "GBP"),
        fc.constantFrom("en-US", "en-GB", "de-DE"),
        (n, currency, locale) => {
          const abs = Math.abs(n);
          const digits = formatMoney(n, currency, locale).replace(/\D/g, "");
          const expected = currency === "JPY" && n % 100 === 0 ? BigInt(abs / 100) : BigInt(abs);
          return BigInt(digits) === expected;
        },
      ),
    );
  });

  it("P10: non-safe-integer input throws RangeError", () => {
    const badArb = fc.oneof(
      fc.double({ noInteger: true, noNaN: true, noDefaultInfinity: true }),
      fc.constantFrom(
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        2 ** 53,
        -(2 ** 53),
      ),
    );
    fc.assert(
      fc.property(badArb, (n) => {
        try {
          formatMoney(n, "USD", "en-US");
          return false;
        } catch (error) {
          return error instanceof RangeError;
        }
      }),
    );
  });
});
