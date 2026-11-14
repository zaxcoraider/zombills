// P12: ids (design "Correctness properties").

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { NormalizedTransaction } from "../normalize/types.js";
import { addMonths, fromDayNumber, parseIsoDate } from "./dates.js";
import { detectSubscriptions } from "./detect-subscriptions.js";
import { isoDateArb, merchantArb, validTxArb } from "./test-arbitraries.js";

const ID_PATTERN = /^sub:[A-Z]{3}:(weekly|monthly|yearly):(\*|\d+(-\d+)?):.+$/;

// Monthly runs from a small merchant pool and a few amounts, so that several Subscriptions often
// share a merchant key, currency and cadence and the discriminators are exercised.
const seriesRowsArb: fc.Arbitrary<NormalizedTransaction[]> = fc
  .record({
    merchant: fc.oneof(merchantArb("known"), merchantArb("generic")),
    start: isoDateArb,
    shifts: fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 3, maxLength: 8 }),
    amountCents: fc.constantFrom(999, 1049, 1549),
    currency: fc.constantFrom("USD", "EUR"),
  })
  .map(({ merchant, start, shifts, amountCents, currency }) => {
    const first = parseIsoDate(start);
    if (first === null) return [];
    return shifts.map((shift, i) => ({
      date: fromDayNumber(addMonths(first, i).day + shift).iso,
      description: "series",
      amountCents,
      currency,
      merchant: { ...merchant },
    }));
  });

// A second run of the same merchant, a different amount and the same dates, to force twins.
const statementArb: fc.Arbitrary<NormalizedTransaction[]> = fc
  .tuple(
    fc.array(validTxArb, { maxLength: 10 }),
    fc.array(seriesRowsArb, { minLength: 1, maxLength: 4 }),
    fc.boolean(),
  )
  .map(([noise, series, twin]) => {
    const rows = [...noise, ...series.flat()];
    if (twin) {
      for (const run of series) {
        rows.push(
          ...run.map((tx) => ({
            ...tx,
            amountCents: tx.amountCents + 500,
            merchant: { ...tx.merchant },
          })),
        );
      }
    }
    return rows;
  });

describe("id properties", () => {
  it("P12: ids are unique, match the pattern, and end with the merchantKey", () => {
    fc.assert(
      fc.property(statementArb, (rows) => {
        const { subscriptions } = detectSubscriptions(rows);
        const ids = subscriptions.map((sub) => sub.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const sub of subscriptions) {
          expect(sub.id).toMatch(ID_PATTERN);
          // The merchantKey may contain ":", so everything after the fourth ":" is the key.
          expect(sub.id.split(":").slice(4).join(":")).toBe(sub.merchantKey);
          expect(sub.id.startsWith(`sub:${sub.currency}:${sub.cadence}:`)).toBe(true);
        }
      }),
    );
  });
});
