import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseAmountCents, tryParseAmount } from "./amount";
import { ParseError } from "./parse-error";
import {
  AMOUNT_RANGE_CENTS,
  amountFormatArbitrary,
  anyAmountStringArbitrary,
  centsArbitrary,
  decimalSeparatorArbitrary,
  formatAmount,
  formatEu,
  formatUs,
} from "./test-arbitraries";

describe("amount parser properties", () => {
  // The input space of P2 is wide and each run is cheap, so it runs 1000 times instead of 100.
  it("P2: parseAmountCents returns a safe integer (never -0) or throws ParseError, for any string", () => {
    fc.assert(
      fc.property(anyAmountStringArbitrary, decimalSeparatorArbitrary, (raw, separator) => {
        let value: number;
        try {
          value = parseAmountCents(raw, separator);
        } catch (error) {
          expect(error).toBeInstanceOf(ParseError);
          return;
        }
        expect(Number.isSafeInteger(value)).toBe(true);
        expect(Object.is(value, -0)).toBe(false);
        expect(Math.abs(value)).toBeLessThanOrEqual(AMOUNT_RANGE_CENTS);
      }),
      { numRuns: 1000 },
    );
  });

  it("P2: tryParseAmount never throws for a string and agrees with parseAmountCents", () => {
    fc.assert(
      fc.property(anyAmountStringArbitrary, decimalSeparatorArbitrary, (raw, separator) => {
        const outcome = tryParseAmount(raw, separator);
        let expected: number | null;
        try {
          expected = parseAmountCents(raw, separator);
        } catch {
          expected = null;
        }
        if (expected === null) {
          expect(outcome.ok).toBe(false);
        } else {
          expect(outcome).toEqual({ ok: true, cents: expected });
        }
      }),
      { numRuns: 500 },
    );
  });

  it("P3: formatUs gives the same text as (cents / 100).toFixed(2)", () => {
    fc.assert(
      fc.property(centsArbitrary, (cents) => {
        expect(formatUs(cents)).toBe((cents / 100).toFixed(2));
      }),
    );
  });

  it("P3: US round-trip, parseAmountCents(formatUs(c), '.') === c", () => {
    fc.assert(
      fc.property(centsArbitrary, (cents) => {
        expect(parseAmountCents(formatUs(cents), ".")).toBe(cents);
      }),
    );
  });

  it("P3: US round-trip also holds with thousands separators, symbols, padding and negative styles", () => {
    fc.assert(
      fc.property(centsArbitrary, amountFormatArbitrary("."), (cents, format) => {
        expect(parseAmountCents(formatAmount(cents, format), ".")).toBe(cents);
      }),
    );
  });

  it("P4: European round-trip, parseAmountCents(formatEu(c, grouped), ',') === c", () => {
    fc.assert(
      fc.property(centsArbitrary, fc.boolean(), (cents, withThousands) => {
        expect(parseAmountCents(formatEu(cents, withThousands), ",")).toBe(cents);
      }),
    );
  });

  it("P4: European round-trip also holds with symbols, padding and negative styles", () => {
    fc.assert(
      fc.property(centsArbitrary, amountFormatArbitrary(","), (cents, format) => {
        expect(parseAmountCents(formatAmount(cents, format), ",")).toBe(cents);
      }),
    );
  });
});
