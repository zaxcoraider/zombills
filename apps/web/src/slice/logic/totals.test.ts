import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Subscription } from "@zombills/core";
import { currencyTotals, groupForDisplay, isCounted } from "./totals";
import { subscriptionArb } from "./test-arbitraries";

function make(overrides: Partial<Subscription> & { cadenceAssumed?: boolean } = {}): Subscription {
  const { cadenceAssumed = false, ...rest } = overrides;
  const [base] = fc.sample(subscriptionArb, { seed: 1, numRuns: 1 });
  if (!base) throw new Error("no sample");
  return {
    ...base,
    id: "id",
    merchant: "Netflix",
    currency: "USD",
    status: "active",
    yearlyCostCents: 1_000,
    ...rest,
    evidence: { ...base.evidence, cadenceAssumed },
  };
}

function groups(subs: Subscription[], order: string[] = ["USD"]) {
  return groupForDisplay(subs, currencyTotals(subs, order), order);
}

describe("isCounted", () => {
  it("counts only active subscriptions with a read cadence", () => {
    expect(isCounted(make())).toBe(true);
    expect(isCounted(make({ status: "ended" }))).toBe(false);
    expect(isCounted(make({ cadenceAssumed: true }))).toBe(false);
  });
});

describe("currencyTotals", () => {
  it("throws RangeError when two Counted subscriptions of MAX_SAFE_INTEGER are added", () => {
    const subs = [
      make({ id: "a", yearlyCostCents: Number.MAX_SAFE_INTEGER }),
      make({ id: "b", yearlyCostCents: Number.MAX_SAFE_INTEGER }),
    ];
    expect(() => currencyTotals(subs, ["USD"])).toThrow(RangeError);
  });

  it("leaves an ended subscription out of the total", () => {
    const subs = [
      make({ id: "a", yearlyCostCents: 500 }),
      make({ id: "b", yearlyCostCents: 700, status: "ended" }),
    ];
    expect(currencyTotals(subs, ["USD"])).toEqual([{ currency: "USD", totalCents: 500 }]);
  });

  it("keeps currencies apart and follows currencyOrder, then code-unit order", () => {
    const subs = [
      make({ id: "a", currency: "USD", yearlyCostCents: 100 }),
      make({ id: "b", currency: "EUR", yearlyCostCents: 200 }),
      make({ id: "c", currency: "GBP", yearlyCostCents: 300 }),
      make({ id: "d", currency: "EUR", yearlyCostCents: 50 }),
    ];
    expect(currencyTotals(subs, ["USD"])).toEqual([
      { currency: "USD", totalCents: 100 },
      { currency: "EUR", totalCents: 250 },
      { currency: "GBP", totalCents: 300 },
    ]);
  });
});

describe("groupForDisplay", () => {
  it("gives a guessed-only group total null and hasExcluded true", () => {
    const [group] = groups([make({ cadenceAssumed: true })]);
    expect(group?.total).toBeNull();
    expect(group?.hasExcluded).toBe(true);
  });

  it("gives an all-Counted group a total and hasExcluded false", () => {
    const [group] = groups([make({ yearlyCostCents: 900 })]);
    expect(group?.total).toEqual({ currency: "USD", totalCents: 900 });
    expect(group?.hasExcluded).toBe(false);
  });

  it("lists Counted subscriptions before ended ones, even when the ended one costs more", () => {
    const [group] = groups([
      make({ id: "ended", status: "ended", yearlyCostCents: 9_000 }),
      make({ id: "live", yearlyCostCents: 100 }),
    ]);
    expect(group?.subscriptions.map((s) => s.id)).toEqual(["live", "ended"]);
  });

  it("breaks ties on cost by merchant, then id", () => {
    const [group] = groups([
      make({ id: "2", merchant: "Spotify" }),
      make({ id: "9", merchant: "Netflix" }),
      make({ id: "1", merchant: "Netflix" }),
      make({ id: "0", merchant: "Hulu", yearlyCostCents: 2_000 }),
    ]);
    expect(group?.subscriptions.map((s) => s.id)).toEqual(["0", "1", "9", "2"]);
  });

  it('puts "Z" before "a" (code-unit order)', () => {
    const [group] = groups([make({ id: "1", merchant: "a" }), make({ id: "2", merchant: "Z" })]);
    expect(group?.subscriptions.map((s) => s.merchant)).toEqual(["Z", "a"]);
  });

  it("does not change its input", () => {
    const subs = [make({ id: "1", yearlyCostCents: 1 }), make({ id: "2", yearlyCostCents: 2 })];
    const copy = [...subs];
    groups(subs);
    expect(subs).toEqual(copy);
  });

  it("orders groups by currencyOrder, then unlisted currencies in code-unit order", () => {
    const subs = [
      make({ id: "1", currency: "USD" }),
      make({ id: "2", currency: "JPY" }),
      make({ id: "3", currency: "EUR" }),
      make({ id: "4", currency: "GBP" }),
    ];
    expect(groups(subs, ["GBP", "USD"]).map((g) => g.currency)).toEqual([
      "GBP",
      "USD",
      "EUR",
      "JPY",
    ]);
  });
});
