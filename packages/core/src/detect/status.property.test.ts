// Status property P18 (design "Correctness properties").

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { NormalizedTransaction } from "../normalize/types.js";
import { ENDED_GRACE_DAYS, addPeriods } from "./cadence-rules.js";
import { fromDayNumber, parseIsoDate } from "./dates.js";
import { detectSubscriptions } from "./detect-subscriptions.js";
import { isoDateArb, monthlySeriesArb, weeklySeriesArb, yearlyPairArb } from "./test-arbitraries.js";

const rowsArb: fc.Arbitrary<NormalizedTransaction[]> = fc.oneof(
  monthlySeriesArb().map((s) => s.transactions),
  weeklySeriesArb.map((s) => s.transactions),
  yearlyPairArb.map((s) => s.transactions),
  // a single known charge: its cadence is assumed (Req 5.4, 7.7)
  yearlyPairArb.map((s) => s.transactions.slice(0, 1)),
);

/** An As-of date near the last charge, or anywhere in 2020–2030, as `asOf` or as the statement end. */
const asOfArb = (rows: readonly NormalizedTransaction[]): fc.Arbitrary<string> => {
  const last = Math.max(...rows.map((tx) => parseIsoDate(tx.date)?.day ?? 0));
  return fc.oneof(
    { weight: 4, arbitrary: fc.integer({ min: -400, max: 450 }).map((offset) => fromDayNumber(last + offset).iso) },
    { weight: 1, arbitrary: isoDateArb },
  );
};

describe("status properties", () => {
  it("P18: ended exactly when the As-of date is more than the grace after nextExpectedDate; before the last charge it is active", () => {
    const seen = { active: 0, ended: 0, early: 0 };
    fc.assert(
      fc.property(
        rowsArb.chain((rows) => asOfArb(rows).map((asOf) => ({ rows, asOf }))),
        ({ rows, asOf }) => {
          const result = detectSubscriptions(rows, { asOf });
          const asOfDay = parseIsoDate(asOf)?.day ?? Number.NaN;
          for (const sub of result.subscriptions) {
            const lastCharge = sub.charges[sub.charges.length - 1];
            const last = parseIsoDate(lastCharge?.date);
            expect(last).not.toBeNull();
            if (last === null) return;
            const next = addPeriods(last, sub.cadence, 1);
            expect(sub.evidence.nextExpectedDate).toBe(next.iso);
            const ended = asOfDay > next.day + ENDED_GRACE_DAYS[sub.cadence];
            expect(sub.status).toBe(ended ? "ended" : "active");
            if (asOfDay < last.day) {
              expect(sub.status).toBe("active");
              seen.early += 1;
            }
            seen[sub.status] += 1;
          }
        },
      ),
    );
    expect(seen.active).toBeGreaterThan(0);
    expect(seen.ended).toBeGreaterThan(0);
    expect(seen.early).toBeGreaterThan(0);
  });

  it("P18: the Req 7.5 and 7.7 examples sit on the boundary", () => {
    const series = (dates: string[]): NormalizedTransaction[] =>
      dates.map((date) => ({
        date,
        description: "netflix",
        amountCents: 1549,
        currency: "USD",
        merchant: { key: "netflix", displayName: "Netflix", source: "known", serviceId: "netflix", processor: null },
      }));
    const rows = series(["2025-11-20", "2025-12-20", "2026-01-20", "2026-02-20"]);
    expect(detectSubscriptions(rows, { asOf: "2026-03-30" }).subscriptions[0]?.status).toBe("active");
    expect(detectSubscriptions(rows, { asOf: "2026-03-31" }).subscriptions[0]?.status).toBe("ended");
    const single = detectSubscriptions(series(["2025-01-10"]), { asOf: "2026-03-01" }).subscriptions[0];
    expect(single?.cadence).toBe("yearly");
    expect(single?.status).toBe("ended");
  });
});
