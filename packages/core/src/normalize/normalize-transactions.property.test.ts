import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Transaction } from "../parse/types.js";
import { normalizeMerchant } from "./normalize-merchant.js";
import { normalizeTransactions } from "./normalize-transactions.js";

const descriptionArb = fc.oneof(
  fc.string({ maxLength: 60 }),
  fc.string({ unit: "binary", maxLength: 60 }),
  fc.constantFrom("NETFLIX.COM 866-579-7172 CA", "PAYPAL *SPOTIFY", "POS 01/12", "HULU", " "),
);

const transactionArb: fc.Arbitrary<Transaction> = fc.record({
  date: fc
    .date({
      min: new Date("2000-01-01T00:00:00Z"),
      max: new Date("2099-12-31T00:00:00Z"),
      noInvalidDate: true,
    })
    .map((d) => d.toISOString().slice(0, 10)),
  description: descriptionArb,
  amountCents: fc.integer({ min: -100_000_000, max: 100_000_000 }),
  currency: fc.stringMatching(/^[A-Z]{3}$/u),
});

const transactionsArb = fc.array(transactionArb, { maxLength: 20 });

describe("normalizeTransactions properties", () => {
  it("P11: pass-through of money, date and currency; input untouched; new objects", () => {
    fc.assert(
      fc.property(transactionsArb, (input) => {
        const before = structuredClone(input);
        const out = normalizeTransactions(input);
        expect(input).toEqual(before);
        expect(out).toHaveLength(input.length);
        expect(new Set(out.map((o) => o.merchant)).size).toBe(out.length);
        out.forEach((o, i) => {
          const t = input[i];
          if (t === undefined) throw new Error("missing input element");
          expect(o).not.toBe(t);
          expect(o.date).toBe(t.date);
          expect(o.description).toBe(t.description);
          expect(o.amountCents).toBe(t.amountCents);
          expect(o.currency).toBe(t.currency);
          expect(o.merchant).toEqual(normalizeMerchant(t.description));
          expect(Object.keys(o).sort()).toEqual([
            "amountCents",
            "currency",
            "date",
            "description",
            "merchant",
          ]);
        });
      }),
    );
  });
});
