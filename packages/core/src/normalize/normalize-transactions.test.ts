import { describe, expect, it } from "vitest";
import type { Transaction } from "../parse/types.js";
import { normalizeMerchant } from "./normalize-merchant.js";
import { normalizeTransactions } from "./normalize-transactions.js";

function tx(description: string, amountCents: number): Transaction {
  return { date: "2026-03-12", description, amountCents, currency: "USD" };
}

describe("normalizeTransactions", () => {
  it("returns [] for an empty array", () => {
    expect(normalizeTransactions([])).toEqual([]);
  });

  it("gives debit, credit and zero rows with the same description equal merchants", () => {
    const out = normalizeTransactions([
      tx("NETFLIX.COM 866-579-7172 CA", 1599),
      tx("NETFLIX.COM 866-579-7172 CA", -1599),
      tx("NETFLIX.COM 866-579-7172 CA", 0),
    ]);
    expect(out[0]?.merchant.key).toBe("netflix");
    expect(out[1]?.merchant).toEqual(out[0]?.merchant);
    expect(out[2]?.merchant).toEqual(out[0]?.merchant);
    expect(out.map((t) => t.amountCents)).toEqual([1599, -1599, 0]);
  });

  it("matches normalizeMerchant for each element and keeps the order", () => {
    const input = [tx("SPOTIFY AB", 999), tx("CAFE MULLER 0412", 450), tx("POS 01/12", 100)];
    const out = normalizeTransactions(input);
    expect(out.map((t) => t.description)).toEqual(input.map((t) => t.description));
    out.forEach((t, i) => {
      expect(t.merchant).toEqual(normalizeMerchant(input[i]?.description ?? ""));
    });
  });

  it("does not throw on a frozen input array of frozen transactions", () => {
    const input = Object.freeze([
      Object.freeze(tx("SPOTIFY AB", 999)),
      Object.freeze(tx("HULU", 1799)),
    ]);
    const out = normalizeTransactions(input);
    expect(out).toHaveLength(2);
    expect(out[0]?.merchant.key).toBe("spotify");
  });

  it("does not copy extra properties of an input object", () => {
    const input = [{ ...tx("HULU", 1799), extra: "secret", rowIndex: 4 }];
    const out = normalizeTransactions(input);
    expect(Object.keys(out[0] ?? {}).sort()).toEqual([
      "amountCents",
      "currency",
      "date",
      "description",
      "merchant",
    ]);
  });

  it("returns new objects and does not mutate the input", () => {
    const input = [tx("HULU", 1799)];
    const before = structuredClone(input);
    const out = normalizeTransactions(input);
    expect(out[0]).not.toBe(input[0]);
    expect(input).toEqual(before);
  });

  it("gives each element its own merchant copy", () => {
    const out = normalizeTransactions([tx("HULU", 1799), tx("HULU", 1799)]);
    const first = out[0];
    const second = out[1];
    if (first === undefined || second === undefined) throw new Error("expected two elements");
    expect(first.merchant).not.toBe(second.merchant);
    first.merchant.key = "changed";
    first.merchant.displayName = "Changed";
    expect(second.merchant.key).toBe("hulu");
    expect(second.merchant.displayName).toBe("Hulu");
  });

  it("propagates the TypeError for a non-string description", () => {
    const bad = [{ ...tx("x", 1), description: 42 }] as unknown as Transaction[];
    expect(() => normalizeTransactions(bad)).toThrow(TypeError);
  });
});
