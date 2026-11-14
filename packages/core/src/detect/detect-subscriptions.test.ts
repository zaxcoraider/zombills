import { describe, expect, it } from "vitest";
import { detectSubscriptions as detectFromIndex } from "../index.js";
import type { NormalizedTransaction } from "../normalize/types.js";
import { detectSubscriptions } from "./detect-subscriptions.js";
import { charge, credit, zero } from "./test-fixtures.js";
import type { TransactionRole } from "./types.js";

/** Runs the detector on rows that the tests build by hand, including invalid ones. */
function run(rows: readonly unknown[], options?: unknown) {
  return detectSubscriptions(rows as readonly NormalizedTransaction[], options as undefined);
}

describe("detectSubscriptions: empty input (Req 1.14)", () => {
  it("returns empty arrays, null dates and no currencies", () => {
    expect(run([])).toEqual({
      subscriptions: [],
      usage: [],
      statement: { firstDate: null, lastDate: null, asOf: null, asOfSource: null, currencies: [] },
    });
  });

  it("takes asOf from a valid option", () => {
    const result = run([], { asOf: "2026-05-01" });
    expect(result.statement.asOf).toBe("2026-05-01");
    expect(result.statement.asOfSource).toBe("option");
    expect(result.subscriptions).toEqual([]);
  });

  it("ignores an invalid asOf option", () => {
    const result = run([], { asOf: "2026-02-30" });
    expect(result.statement.asOf).toBeNull();
    expect(result.statement.asOfSource).toBeNull();
  });
});

describe("detectSubscriptions: type contract (Req 1.13)", () => {
  it.each([undefined, null, {}, "x", 5, { length: 0 }])("throws a TypeError for %j", (value) => {
    expect(() => run(value as never)).toThrow(TypeError);
    expect(() => run(value as never)).toThrow("detectSubscriptions: transactions must be an array");
  });

  it("reads a sparse array hole as invalid", () => {
    // eslint-disable-next-line no-sparse-arrays -- the hole is the case under test
    const rows = [charge("2026-01-02", 999, "merchant:gym"), , charge("2026-01-03", 999, "merchant:gym")];
    const { usage } = run(rows);
    expect(usage).toHaveLength(3);
    expect(usage[1]?.role).toBe("invalid");
    expect(usage[1]?.reason).toBeTruthy();
    expect(usage.map((u) => u.index)).toEqual([0, 1, 2]);
  });
});

describe("detectSubscriptions: roles (Req 1.8–1.10, 2.3, 2.5, 5.5, 6.5)", () => {
  // Input order is deliberately not date order.
  const rows: unknown[] = [
    charge("2026-03-02", 1549, "netflix"), // 0
    charge("2026-01-05", 500, "merchant:cafe"), // 1 refunded
    zero("2026-01-01", "merchant:trial"), // 2
    { date: "not-a-date" }, // 3 invalid
    charge("2026-01-02", 1549, "netflix"), // 4
    credit("2026-01-10", 500, "merchant:cafe"), // 5 its refund
    charge("2026-02-02", 1549, "netflix"), // 6
    credit("2026-02-10", 300, "netflix"), // 7 partial refund
    charge("2026-02-14", 4321, "merchant:bookshop"), // 8 one-off
  ];
  const result = run(rows);
  const roleAt = (i: number): TransactionRole | undefined => result.usage[i]?.role;

  it("gives each role once", () => {
    expect(result.usage.map((u) => u.role)).toEqual([
      "subscription-charge",
      "refunded-charge",
      "zero-amount",
      "invalid",
      "subscription-charge",
      "refund",
      "subscription-charge",
      "money-in",
      "not-recurring",
    ]);
    expect(roleAt(3)).toBe("invalid");
  });

  it("keeps input order and index", () => {
    expect(result.usage.map((u) => u.index)).toEqual(rows.map((_, i) => i));
  });

  it("sets subscriptionId exactly on subscription-charge entries", () => {
    expect(result.subscriptions).toHaveLength(1);
    const id = result.subscriptions[0]?.id;
    expect(id).toBe("sub:USD:monthly:*:netflix");
    for (const u of result.usage) {
      expect(u.subscriptionId).toBe(u.role === "subscription-charge" ? id : null);
    }
  });

  it("sets reason non-null exactly on invalid entries", () => {
    for (const u of result.usage) {
      if (u.role === "invalid") expect(u.reason).toMatch(/\S/);
      else expect(u.reason).toBeNull();
    }
  });

  it("lists every subscription-charge entry in that Subscription's charges", () => {
    const sub = result.subscriptions[0];
    const listed = result.usage.filter((u) => u.role === "subscription-charge").length;
    expect(sub?.charges).toHaveLength(listed);
    expect(sub?.charges.map((c) => c.date)).toEqual(["2026-01-02", "2026-02-02", "2026-03-02"]);
  });

  it("gives the charges of an overflowed Subscription the role not-recurring", () => {
    const huge = Number.MAX_SAFE_INTEGER - 1;
    const overflow = run([
      charge("2026-01-02", huge, "merchant:big"),
      charge("2026-02-02", huge, "merchant:big"),
      charge("2026-03-02", huge, "merchant:big"),
    ]);
    expect(overflow.subscriptions).toEqual([]);
    expect(overflow.usage.map((u) => u.role)).toEqual(["not-recurring", "not-recurring", "not-recurring"]);
  });

  it("gives the charges of a rejected Series the role not-recurring", () => {
    const rejected = run([charge("2026-01-02", 999, "merchant:gym"), charge("2026-02-02", 1999, "merchant:gym")]);
    expect(rejected.subscriptions).toEqual([]);
    expect(rejected.usage.map((u) => u.role)).toEqual(["not-recurring", "not-recurring"]);
  });
});

describe("detectSubscriptions: statement range (Req 1.4, 2.1)", () => {
  it("does not let invalid elements move firstDate or lastDate", () => {
    const result = run([
      { date: "2020-01-01", description: "x" },
      charge("2026-01-02", 999, "merchant:gym"),
      charge("2026-02-02", 999, "merchant:gym"),
      { date: "2031-12-31", amountCents: "1" },
      null,
    ]);
    expect(result.statement.firstDate).toBe("2026-01-02");
    expect(result.statement.lastDate).toBe("2026-02-02");
    expect(result.statement.asOf).toBe("2026-02-02");
  });
});

describe("detectSubscriptions: input is not changed (Req 1.12)", () => {
  it("accepts a frozen array of frozen elements and leaves them unchanged", () => {
    const rows = [
      charge("2026-01-02", 1549, "netflix"),
      charge("2026-02-02", 1549, "netflix"),
      credit("2026-02-10", 300, "netflix"),
      zero("2026-01-01", "merchant:trial"),
    ];
    for (const row of rows) {
      Object.freeze(row.merchant);
      Object.freeze(row);
    }
    Object.freeze(rows);
    const before = JSON.stringify(rows);
    let result: ReturnType<typeof detectSubscriptions> | undefined;
    expect(() => {
      result = detectSubscriptions(rows);
    }).not.toThrow();
    expect(JSON.stringify(rows)).toBe(before);
    expect(result?.subscriptions).toHaveLength(1);
  });
});

describe("detectSubscriptions: export", () => {
  it("is the same function from ../index.js", () => {
    expect(detectFromIndex).toBe(detectSubscriptions);
  });
});
