// P3: order independence (design "Correctness properties").

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { NormalizedTransaction } from "../normalize/types.js";
import { addMonths, fromDayNumber, parseIsoDate } from "./dates.js";
import { detectSubscriptions } from "./detect-subscriptions.js";
import { isoDateArb, merchantArb, validTxArb } from "./test-arbitraries.js";
import type { TransactionUsage } from "./types.js";

// Monthly runs of one merchant at one amount, so that results contain Subscriptions.
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
    return shifts
      .map((shift) => ({ shift }))
      .map(({ shift }, i) => ({
        date: fromDayNumber(addMonths(first, i).day + shift).iso,
        description: "series",
        amountCents,
        currency,
        merchant: { ...merchant },
      }));
  });

/**
 * Valid rows with duplicates and same-date ties forced in: exact copies of random rows, and
 * copies that keep the date but change the amount or the merchant.
 */
const tiedRowsArb: fc.Arbitrary<NormalizedTransaction[]> = fc
  .record({
    noise: fc.array(validTxArb, { maxLength: 10 }),
    series: fc.array(seriesRowsArb, { maxLength: 3 }),
    copies: fc.array(
      fc.record({ pick: fc.nat(), kind: fc.constantFrom("equal", "amount", "merchant") }),
      {
        maxLength: 8,
      },
    ),
    otherMerchant: merchantArb("generic"),
  })
  .map(({ noise, series, copies, otherMerchant }) => {
    const rows = [...noise, ...series.flat()];
    if (rows.length === 0) return rows;
    for (const { pick, kind } of copies) {
      const template = rows[pick % rows.length] as NormalizedTransaction;
      const copy: NormalizedTransaction = { ...template, merchant: { ...template.merchant } };
      if (kind === "amount") copy.amountCents = template.amountCents === 999 ? 1049 : 999;
      if (kind === "merchant") copy.merchant = { ...otherMerchant };
      rows.push(copy);
    }
    return rows;
  });

const optionsArb: fc.Arbitrary<{ asOf: string } | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.record({ asOf: isoDateArb }),
);

/** A row and a random permutation of its positions: `order[k]` is the old index at new position k. */
const rowsAndOrderArb = tiedRowsArb.chain((rows) =>
  fc.tuple(
    fc.constant(rows),
    fc.shuffledSubarray(
      rows.map((_, i) => i),
      { minLength: rows.length, maxLength: rows.length },
    ),
    optionsArb,
  ),
);

const contentKey = (tx: NormalizedTransaction): string =>
  JSON.stringify([
    tx.date,
    tx.description,
    tx.amountCents,
    tx.currency,
    tx.merchant.key,
    tx.merchant.displayName,
    tx.merchant.source,
    tx.merchant.serviceId,
    tx.merchant.processor,
  ]);

const roleKey = (entry: TransactionUsage): string =>
  JSON.stringify([entry.role, entry.subscriptionId]);

describe("order independence properties", () => {
  it("P3: any permutation gives equal subscriptions and statement, and each element keeps its role and subscriptionId", () => {
    fc.assert(
      fc.property(rowsAndOrderArb, ([rows, order, options]) => {
        const permuted = order.map((i) => rows[i] as NormalizedTransaction);
        const before = detectSubscriptions(rows, options);
        const after = detectSubscriptions(permuted, options);
        expect(after.subscriptions).toEqual(before.subscriptions);
        expect(after.statement).toEqual(before.statement);
        expect(after.usage).toHaveLength(rows.length);

        // Fully equal elements may swap, so compare the roles of each content class as a multiset.
        const expected = new Map<string, string[]>();
        const actual = new Map<string, string[]>();
        rows.forEach((tx, i) => {
          const key = contentKey(tx);
          const list = expected.get(key) ?? [];
          list.push(roleKey(before.usage[i] as TransactionUsage));
          expected.set(key, list);
        });
        permuted.forEach((tx, k) => {
          const key = contentKey(tx);
          const list = actual.get(key) ?? [];
          list.push(roleKey(after.usage[k] as TransactionUsage));
          actual.set(key, list);
        });
        expect(actual.size).toBe(expected.size);
        for (const [key, list] of expected) {
          expect((actual.get(key) ?? []).slice().sort()).toEqual(list.slice().sort());
        }
      }),
      { numRuns: 300 },
    );
  });
});
