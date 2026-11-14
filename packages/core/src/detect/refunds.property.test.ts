// Refund property P11 (design "Correctness properties").

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { NormalizedTransaction } from "../normalize/types.js";
import { fromDayNumber, parseIsoDate } from "./dates.js";
import { detectSubscriptions } from "./detect-subscriptions.js";
import { monthlySeriesArb } from "./test-arbitraries.js";

function dayOf(tx: NormalizedTransaction): number {
  return (parseIsoDate(tx.date) as { day: number }).day;
}

describe("refund properties", () => {
  it("P11: a full refund of one middle charge keeps the id and adds one missed period", () => {
    fc.assert(
      fc.property(
        monthlySeriesArb().chain((series) =>
          fc.tuple(
            fc.constant(series),
            fc.integer({ min: 1, max: series.transactions.length - 2 }),
            fc.nat({ max: 45 }),
          ),
        ),
        ([series, middle, offsetSeed]) => {
          const rows = series.transactions;
          const target = rows[middle] as NormalizedTransaction;
          const next = rows[middle + 1] as NormalizedTransaction;
          // 0 to 45 days after the charge, and before the next charge
          const room = Math.min(45, dayOf(next) - dayOf(target) - 1);
          const offset = offsetSeed % (room + 1);
          const credit: NormalizedTransaction = {
            ...target,
            description: "refund",
            date: fromDayNumber(dayOf(target) + offset).iso,
            amountCents: -target.amountCents,
            merchant: { ...target.merchant },
          };

          const base = detectSubscriptions(rows);
          expect(base.subscriptions).toHaveLength(1);
          const before = base.subscriptions[0];
          expect(before?.cadence).toBe("monthly");

          const input = [...rows, credit];
          const result = detectSubscriptions(input);
          expect(result.usage[middle]?.role).toBe("refunded-charge");
          expect(result.usage[middle]?.subscriptionId).toBeNull();
          expect(result.usage[input.length - 1]?.role).toBe("refund");
          expect(result.subscriptions).toHaveLength(1);
          const after = result.subscriptions[0];
          expect(after?.id).toBe(before?.id);
          expect(after?.charges.map((c) => c.date)).toEqual(
            rows.filter((_, i) => i !== middle).map((c) => c.date),
          );
          expect(after?.evidence.missedPeriods).toBe((before?.evidence.missedPeriods ?? 0) + 1);
        },
      ),
    );
  });
});
