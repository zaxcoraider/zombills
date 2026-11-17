// Whole-result properties P1, P2, P4, P14 and P19 (design "Correctness properties").

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { NormalizedTransaction } from "../normalize/types.js";
import { addMonths, fromDayNumber, parseIsoDate } from "./dates.js";
import { detectSubscriptions } from "./detect-subscriptions.js";
import {
  isoDateArb,
  junkElementArb,
  merchantArb,
  unrelatedChargesArb,
  validTxArb,
} from "./test-arbitraries.js";
import type { DetectionResult, Subscription } from "./types.js";
import { validateElement } from "./validate.js";

/** Runs the detector on rows that may be invalid, with options of any shape. */
function run(rows: readonly unknown[], options?: unknown): DetectionResult {
  return detectSubscriptions(rows as readonly NormalizedTransaction[], options as undefined);
}

// Series start dates stay within 2020-2030 so that every shifted, month-added or refund date remains
// a valid four-digit ISO date (isoDateArb's wide branch reaches year 9999 and can roll into year 10000).
const seriesStartArb: fc.Arbitrary<string> = fc
  .tuple(fc.integer({ min: 2020, max: 2030 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }))
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);

// A monthly run of one merchant, optionally with a full refund of one charge, so that results
// contain Subscriptions, refunds and ids instead of only random one-off rows.
const seriesRowsArb: fc.Arbitrary<NormalizedTransaction[]> = fc
  .record({
    merchant: fc.oneof(merchantArb("known"), merchantArb("generic"), merchantArb("unidentified")),
    start: seriesStartArb,
    shifts: fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 2, maxLength: 8 }),
    amountCents: fc.integer({ min: 100, max: 5000 }),
    currency: fc.constantFrom("USD", "EUR"),
    refund: fc.option(fc.nat({ max: 7 }), { nil: null }),
  })
  .map(({ merchant, start, shifts, amountCents, currency, refund }) => {
    const first = parseIsoDate(start);
    if (first === null) return [];
    const rows: NormalizedTransaction[] = shifts.map((shift, i) => ({
      date: fromDayNumber(addMonths(first, i).day + shift).iso,
      description: "series",
      amountCents,
      currency,
      merchant: { ...merchant },
    }));
    if (refund !== null) {
      const target = rows[refund % rows.length] as NormalizedTransaction;
      const day = (parseIsoDate(target.date) as { day: number }).day + 3;
      rows.push({ ...target, date: fromDayNumber(day).iso, amountCents: -amountCents, merchant: { ...merchant } });
    }
    return rows;
  });

const validStatementArb: fc.Arbitrary<NormalizedTransaction[]> = fc
  .tuple(fc.array(validTxArb, { maxLength: 15 }), fc.array(seriesRowsArb, { maxLength: 3 }))
  .map(([noise, series]) => [...noise, ...series.flat()]);

const mixedStatementArb: fc.Arbitrary<unknown[]> = fc
  .tuple(fc.array(fc.oneof(validTxArb, junkElementArb), { maxLength: 15 }), validStatementArb)
  .map(([mixed, valid]) => [...mixed, ...valid]);

const optionsArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.anything(),
  fc.record({ asOf: isoDateArb }),
  fc.record({ asOf: fc.string() }),
);

describe("detectSubscriptions properties", () => {
  it("P1: never throws on plain data; usage matches the input length; non-arrays throw TypeError", () => {
    fc.assert(
      fc.property(mixedStatementArb, optionsArb, (rows, options) => {
        const result = run(rows, options);
        expect(result.usage).toHaveLength(rows.length);
        result.usage.forEach((entry, i) => expect(entry.index).toBe(i));
      }),
      { numRuns: 300 },
    );
    fc.assert(
      fc.property(
        fc.anything().filter((value) => !Array.isArray(value)),
        (value) => {
          expect(() => run(value as never)).toThrow(TypeError);
        },
      ),
    );
  });

  it("P2: deterministic", () => {
    fc.assert(
      fc.property(mixedStatementArb, optionsArb, (rows, options) => {
        expect(run(rows, options)).toEqual(run(rows, options));
      }),
    );
  });

  it("P4: each charge used once; Req 1.9 usage rules hold in both directions", () => {
    fc.assert(
      fc.property(mixedStatementArb, (rows) => {
        const result = run(rows);
        const ids = result.subscriptions.map((sub) => sub.id);
        expect(new Set(ids).size).toBe(ids.length);

        result.usage.forEach((entry, i) => {
          const checked = validateElement(rows[i], i);
          expect(entry.index).toBe(i);
          // reason is non-null exactly for "invalid"; "invalid" exactly for failed validation
          expect(entry.role === "invalid").toBe(!checked.ok);
          expect(entry.reason !== null).toBe(entry.role === "invalid");
          if (entry.reason !== null) expect(entry.reason).not.toBe("");
          // subscriptionId is set exactly for "subscription-charge"
          expect(entry.subscriptionId !== null).toBe(entry.role === "subscription-charge");
          if (!checked.ok) return;
          const amount = checked.entry.amountCents;
          if (amount < 0) expect(["refund", "money-in"]).toContain(entry.role);
          else if (amount === 0) expect(entry.role).toBe("zero-amount");
          else expect(["subscription-charge", "refunded-charge", "not-recurring"]).toContain(entry.role);
        });

        for (const sub of result.subscriptions) {
          const used = result.usage.filter((entry) => entry.subscriptionId === sub.id);
          expect(used).toHaveLength(sub.charges.length);
          const days = sub.charges.map((c) => (parseIsoDate(c.date) as { day: number }).day);
          for (let i = 1; i < days.length; i++) expect(days[i] as number).toBeGreaterThan(days[i - 1] as number);
          for (const charge of sub.charges) {
            expect(charge.amountCents).toBeGreaterThan(0);
            expect(charge.merchant.key).toBe(sub.merchantKey);
            expect(charge.currency).toBe(sub.currency);
          }
          // every "subscription-charge" entry of this id is exactly one of the charges
          const sources = used.map((entry) => rows[entry.index] as NormalizedTransaction);
          const project = (tx: NormalizedTransaction) =>
            JSON.stringify([tx.date, tx.description, tx.amountCents, tx.currency, tx.merchant]);
          const sortedSources = sources.map(project).sort();
          const sortedCharges = sub.charges.map(project).sort();
          expect(sortedSources).toEqual(sortedCharges);
        }
      }),
    );
  });

  it("P14: no mutation; charges are new objects with exactly the 4 + 5 fields", () => {
    const withExtras = validStatementArb.map((rows) =>
      rows.map((tx, i) => ({ ...tx, extra: i, merchant: { ...tx.merchant, extra: i } })),
    );
    fc.assert(
      fc.property(withExtras, (rows) => {
        const before = structuredClone(rows);
        const result = run(rows);
        expect(rows).toEqual(before);
        const merchants = new Set<unknown>(rows.map((tx) => tx.merchant));
        const inputs = new Set<unknown>(rows);
        for (const sub of result.subscriptions) {
          for (const charge of sub.charges) {
            expect(inputs.has(charge)).toBe(false);
            expect(merchants.has(charge.merchant)).toBe(false);
            expect(Object.keys(charge).sort()).toEqual(["amountCents", "currency", "date", "description", "merchant"]);
            expect(Object.keys(charge.merchant).sort()).toEqual([
              "displayName",
              "key",
              "processor",
              "serviceId",
              "source",
            ]);
            const source = rows.find(
              (tx) =>
                tx.date === charge.date &&
                tx.amountCents === charge.amountCents &&
                tx.currency === charge.currency &&
                tx.merchant.key === charge.merchant.key,
            );
            expect(source).toBeDefined();
          }
        }
      }),
    );
  });

  it("P19: Zero-amount rows inside the Statement range change only evidence.freeTrialDate", () => {
    const zeroSpecArb = fc.array(fc.record({ pick: fc.nat(), offset: fc.nat() }), { maxLength: 6 });
    const clearTrial = (subs: Subscription[]): Subscription[] =>
      subs.map((sub) => ({ ...sub, evidence: { ...sub.evidence, freeTrialDate: null } }));
    fc.assert(
      fc.property(validStatementArb, zeroSpecArb, (rows, specs) => {
        const base = run(rows);
        const { firstDate, lastDate } = base.statement;
        if (firstDate === null || lastDate === null || rows.length === 0) return;
        const first = (parseIsoDate(firstDate) as { day: number }).day;
        const span = (parseIsoDate(lastDate) as { day: number }).day - first + 1;
        const added = specs.map(({ pick, offset }) => {
          const template = rows[pick % rows.length] as NormalizedTransaction;
          return {
            date: fromDayNumber(first + (offset % span)).iso,
            description: "zero",
            amountCents: 0,
            currency: template.currency,
            merchant: { ...template.merchant },
          };
        });
        const result = run([...rows, ...added]);
        expect(result.statement).toEqual(base.statement);
        expect(clearTrial(result.subscriptions)).toEqual(clearTrial(base.subscriptions));
        expect(result.usage.slice(0, rows.length)).toEqual(base.usage);
        for (const entry of result.usage.slice(rows.length)) {
          expect(entry.role).toBe("zero-amount");
          expect(entry.subscriptionId).toBeNull();
        }
      }),
    );
  });

  it("P7: unrelated purchases leave subscriptions equal and are all not-recurring", () => {
    let added = 0;
    fc.assert(
      fc.property(
        validStatementArb
          .filter((rows) => rows.length > 0)
          .chain((rows) => fc.tuple(fc.constant(rows), unrelatedChargesArb(rows))),
        ([rows, extra]) => {
          const base = run(rows);
          const result = run([...rows, ...extra]);
          expect(result.subscriptions).toEqual(base.subscriptions);
          expect(result.statement).toEqual(base.statement);
          expect(result.usage.slice(0, rows.length)).toEqual(base.usage);
          for (const entry of result.usage.slice(rows.length)) {
            added += 1;
            expect(entry.role).toBe("not-recurring");
            expect(entry.subscriptionId).toBeNull();
          }
        },
      ),
    );
    expect(added).toBeGreaterThan(0);
  });
});
