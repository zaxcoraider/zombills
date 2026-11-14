import { describe, expect, it } from "vitest";
import type { NormalizedTransaction } from "../normalize/types.js";
import { fromDayNumber, dayNumber } from "./dates.js";
import { detectSubscriptions } from "./detect-subscriptions.js";
import { charge, credit } from "./test-fixtures.js";
import type { DetectionResult, Subscription, TransactionRole } from "./types.js";

// Fixtures go through the public detectSubscriptions and check the full result
// the requirement row names. Dates are 2026 unless stated.

const NETFLIX = "netflix";
const APPLE = "unidentified:apple:apple.com/bill 866-712-7753 ca";

/** "01-10" → "2026-01-10"; full dates pass through. */
function d(date: string): string {
  return date.length === 5 ? `2026-${date}` : date;
}

/** One charge per date at one amount. */
function charges(key: string, amountCents: number, dates: readonly string[]) {
  return dates.map((date) => charge(d(date), amountCents, key));
}

function rolesOf(result: DetectionResult): TransactionRole[] {
  return result.usage.map((u) => u.role);
}

/** Everything a fixture row states about a Subscription, in one comparable object. */
function summary(sub: Subscription) {
  return {
    id: sub.id,
    cadence: sub.cadence,
    currentAmountCents: sub.currentAmountCents,
    yearlyCostCents: sub.yearlyCostCents,
    priceHistory: sub.priceHistory,
    status: sub.status,
    confidence: sub.confidence,
    chargeDates: sub.charges.map((c) => c.date),
    regularChargeCount: sub.evidence.regularChargeCount,
    lateChargeDates: sub.evidence.lateChargeDates,
    cadenceAssumed: sub.evidence.cadenceAssumed,
    introCharge: sub.evidence.introCharge,
  };
}

function summaries(result: DetectionResult) {
  return result.subscriptions.map(summary).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function run(rows: readonly NormalizedTransaction[]): DetectionResult {
  return detectSubscriptions(rows);
}

describe("Req 2.7: a credit in a different Group is not a refund", () => {
  it("leaves the order not-recurring and the refund money-in", () => {
    const rows = [
      charge("2026-02-14", 2347, "merchant:online-marketplace-order"),
      credit("2026-02-17", 2347, "merchant:online-marketplace-refund"),
    ];
    const result = run(rows);
    expect(rolesOf(result)).toEqual(["not-recurring", "money-in"]);
    expect(result.subscriptions).toEqual([]);
    expect(result.usage.every((u) => u.subscriptionId === null)).toBe(true);
  });
});

describe("Req 3.4: the earliest-start sweep", () => {
  it("reports Jan 10, Feb 9, Mar 10 and leaves Feb 11 out", () => {
    const rows = charges("merchant:fitzone", 999, ["01-10", "02-09", "02-11", "03-10"]);
    const result = run(rows);
    expect(rolesOf(result)).toEqual([
      "subscription-charge",
      "subscription-charge",
      "not-recurring",
      "subscription-charge",
    ]);
    expect(summaries(result)).toEqual([
      {
        id: "sub:USD:monthly:*:merchant:fitzone",
        cadence: "monthly",
        currentAmountCents: 999,
        yearlyCostCents: 11988,
        priceHistory: [{ date: "2026-01-10", amountCents: 999 }],
        status: "active",
        confidence: "high",
        chargeDates: ["2026-01-10", "2026-02-09", "2026-03-10"],
        regularChargeCount: 3,
        lateChargeDates: [],
        cadenceAssumed: false,
        introCharge: null,
      },
    ]);
  });

  it("reports one plan once: Jan 1, Feb 1, Mar 3, with id discriminator *", () => {
    const rows = charges("merchant:fitzone", 999, ["01-01", "02-01", "02-03", "03-03"]);
    const result = run(rows);
    expect(rolesOf(result)).toEqual([
      "subscription-charge",
      "subscription-charge",
      "not-recurring",
      "subscription-charge",
    ]);
    expect(result.subscriptions).toHaveLength(1);
    expect(summaries(result)[0]).toMatchObject({
      id: "sub:USD:monthly:*:merchant:fitzone",
      chargeDates: ["2026-01-01", "2026-02-01", "2026-03-03"],
      currentAmountCents: 999,
      yearlyCostCents: 11988,
      priceHistory: [{ date: "2026-01-01", amountCents: 999 }],
    });
  });
});

describe("Req 3.5: one unidentified key, two prices", () => {
  it("gives the 99 and the 1099 charges their own Subscriptions", () => {
    const rows = [
      ...charges(APPLE, 99, ["01-12", "02-12", "03-12"]),
      ...charges(APPLE, 1099, ["01-12", "02-12", "03-12"]),
    ];
    const result = run(rows);
    expect(rolesOf(result)).toEqual(Array<TransactionRole>(6).fill("subscription-charge"));
    expect(summaries(result)).toEqual([
      {
        id: `sub:USD:monthly:1099:${APPLE}`,
        cadence: "monthly",
        currentAmountCents: 1099,
        yearlyCostCents: 13188,
        priceHistory: [{ date: "2026-01-12", amountCents: 1099 }],
        status: "active",
        confidence: "high",
        chargeDates: ["2026-01-12", "2026-02-12", "2026-03-12"],
        regularChargeCount: 3,
        lateChargeDates: [],
        cadenceAssumed: false,
        introCharge: null,
      },
      {
        id: `sub:USD:monthly:99:${APPLE}`,
        cadence: "monthly",
        currentAmountCents: 99,
        yearlyCostCents: 1188,
        priceHistory: [{ date: "2026-01-12", amountCents: 99 }],
        status: "active",
        confidence: "high",
        chargeDates: ["2026-01-12", "2026-02-12", "2026-03-12"],
        regularChargeCount: 3,
        lateChargeDates: [],
        cadenceAssumed: false,
        introCharge: null,
      },
    ]);
    // Each charge is listed under the id of its own amount.
    for (const [i, u] of result.usage.entries()) {
      expect(u.subscriptionId).toBe(
        i < 3 ? `sub:USD:monthly:99:${APPLE}` : `sub:USD:monthly:1099:${APPLE}`,
      );
    }
  });
});

describe("Req 3.6: price changes join into one Series", () => {
  it("joins Netflix 1549, 1549, 1799 into one Series with a price history", () => {
    const rows = [
      charge("2026-01-02", 1549, NETFLIX),
      charge("2026-02-02", 1549, NETFLIX),
      charge("2026-03-02", 1799, NETFLIX),
    ];
    const result = run(rows);
    expect(rolesOf(result)).toEqual(Array<TransactionRole>(3).fill("subscription-charge"));
    expect(summaries(result)).toEqual([
      {
        id: "sub:USD:monthly:*:netflix",
        cadence: "monthly",
        currentAmountCents: 1799,
        yearlyCostCents: 21588,
        priceHistory: [
          { date: "2026-01-02", amountCents: 1549 },
          { date: "2026-03-02", amountCents: 1799 },
        ],
        status: "active",
        confidence: "high",
        chargeDates: ["2026-01-02", "2026-02-02", "2026-03-02"],
        regularChargeCount: 3,
        lateChargeDates: [],
        cadenceAssumed: false,
        introCharge: null,
      },
    ]);
  });

  it("joins two one-charge known Segments one month apart into a monthly Series", () => {
    const result = run([charge("2026-01-02", 1549, NETFLIX), charge("2026-02-02", 1799, NETFLIX)]);
    expect(rolesOf(result)).toEqual(["subscription-charge", "subscription-charge"]);
    expect(summaries(result)).toEqual([
      {
        id: "sub:USD:monthly:*:netflix",
        cadence: "monthly",
        currentAmountCents: 1799,
        yearlyCostCents: 21588,
        priceHistory: [
          { date: "2026-01-02", amountCents: 1549 },
          { date: "2026-02-02", amountCents: 1799 },
        ],
        status: "active",
        confidence: "high",
        chargeDates: ["2026-01-02", "2026-02-02"],
        regularChargeCount: 2,
        lateChargeDates: [],
        cadenceAssumed: false,
        introCharge: null,
      },
    ]);
  });

  it("joins a late price-change charge and records it as late", () => {
    const result = run([
      charge("2026-01-02", 1549, NETFLIX),
      charge("2026-02-02", 1549, NETFLIX),
      charge("2026-03-07", 1799, NETFLIX),
    ]);
    expect(rolesOf(result)).toEqual(Array<TransactionRole>(3).fill("subscription-charge"));
    expect(summaries(result)).toEqual([
      {
        id: "sub:USD:monthly:*:netflix",
        cadence: "monthly",
        currentAmountCents: 1799,
        yearlyCostCents: 21588,
        priceHistory: [
          { date: "2026-01-02", amountCents: 1549 },
          { date: "2026-03-07", amountCents: 1799 },
        ],
        status: "active",
        confidence: "high",
        chargeDates: ["2026-01-02", "2026-02-02", "2026-03-07"],
        regularChargeCount: 3,
        lateChargeDates: ["2026-03-07"],
        cadenceAssumed: false,
        introCharge: null,
      },
    ]);
  });

  it("does not read a varying generic purchase as a price change", () => {
    const result = run([
      charge("2026-01-10", 5430, "merchant:supermarket"),
      charge("2026-02-10", 6118, "merchant:supermarket"),
    ]);
    expect(result.subscriptions).toEqual([]);
    expect(rolesOf(result)).toEqual(["not-recurring", "not-recurring"]);
  });
});

describe("Req 3.7: introductory charges", () => {
  it("makes the cheap first Netflix charge the introductory charge", () => {
    const rows = [
      charge("2026-01-10", 100, NETFLIX),
      charge("2026-02-10", 1499, NETFLIX),
      charge("2026-03-10", 1499, NETFLIX),
    ];
    const result = run(rows);
    expect(rolesOf(result)).toEqual(Array<TransactionRole>(3).fill("subscription-charge"));
    expect(summaries(result)).toEqual([
      {
        id: "sub:USD:monthly:*:netflix",
        cadence: "monthly",
        currentAmountCents: 1499,
        yearlyCostCents: 17988,
        priceHistory: [
          { date: "2026-01-10", amountCents: 100 },
          { date: "2026-02-10", amountCents: 1499 },
        ],
        status: "active",
        confidence: "high",
        chargeDates: ["2026-01-10", "2026-02-10", "2026-03-10"],
        regularChargeCount: 2,
        lateChargeDates: [],
        cadenceAssumed: false,
        introCharge: { date: "2026-01-10", amountCents: 100 },
      },
    ]);
  });

  it("gives an unidentified Apple key no introductory charge", () => {
    const rows = [
      charge("2026-01-10", 199, APPLE),
      charge("2026-02-10", 1099, APPLE),
      charge("2026-03-10", 1099, APPLE),
    ];
    const result = run(rows);
    expect(rolesOf(result)).toEqual([
      "not-recurring",
      "subscription-charge",
      "subscription-charge",
    ]);
    expect(result.subscriptions).toHaveLength(1);
    expect(summaries(result)[0]).toMatchObject({
      id: `sub:USD:monthly:*:${APPLE}`,
      currentAmountCents: 1099,
      priceHistory: [{ date: "2026-02-10", amountCents: 1099 }],
      chargeDates: ["2026-02-10", "2026-03-10"],
      regularChargeCount: 2,
      introCharge: null,
    });
  });
});

describe("Req 3.11: step order", () => {
  it("rejects the coffee cover and leaves all 9 charges not-recurring", () => {
    const rows = charges("merchant:coffee", 450, [
      "01-05",
      "01-12",
      "01-19",
      "01-26",
      "02-02",
      "03-02",
      "03-09",
      "03-16",
      "03-23",
    ]);
    const result = run(rows);
    expect(result.subscriptions).toEqual([]);
    expect(rolesOf(result)).toEqual(Array<TransactionRole>(9).fill("not-recurring"));
  });

  it("reports generic 999 monthly and ignores the weekly-looking extras", () => {
    const rows = charges("merchant:fitzone", 999, [
      "01-01",
      "01-08",
      "01-15",
      "02-01",
      "03-01",
      "04-01",
    ]);
    const result = run(rows);
    expect(rolesOf(result)).toEqual([
      "subscription-charge",
      "not-recurring",
      "not-recurring",
      "subscription-charge",
      "subscription-charge",
      "subscription-charge",
    ]);
    expect(summaries(result)).toEqual([
      {
        id: "sub:USD:monthly:*:merchant:fitzone",
        cadence: "monthly",
        currentAmountCents: 999,
        yearlyCostCents: 11988,
        priceHistory: [{ date: "2026-01-01", amountCents: 999 }],
        status: "active",
        confidence: "high",
        chargeDates: ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"],
        regularChargeCount: 4,
        lateChargeDates: [],
        cadenceAssumed: false,
        introCharge: null,
      },
    ]);
    expect(result.subscriptions[0]?.evidence.firstChargeDate).toBe("2026-01-01");
  });
});

// Req 4.8: generic monthly charges, one amount, one band.
const GYM = "merchant:fitzone";
const GYM_ID = "sub:USD:monthly:*:merchant:fitzone";

/** The one-Series result a Req 4.8 row states. */
function expectOneMonthlySeries(
  dates: readonly string[],
  expected: { missedPeriods: number; lateChargeDates?: string[] },
): void {
  const result = run(charges(GYM, 999, dates));
  expect(rolesOf(result)).toEqual(Array<TransactionRole>(dates.length).fill("subscription-charge"));
  expect(result.subscriptions).toHaveLength(1);
  const sub = result.subscriptions[0] as Subscription;
  expect(sub.id).toBe(GYM_ID);
  expect(sub.cadence).toBe("monthly");
  expect(sub.currentAmountCents).toBe(999);
  expect(sub.yearlyCostCents).toBe(11988);
  expect(sub.charges.map((c) => c.date)).toEqual(dates.map(d));
  expect(sub.evidence.missedPeriods).toBe(expected.missedPeriods);
  expect(sub.evidence.lateChargeDates).toEqual(expected.lateChargeDates ?? []);
  expect(sub.evidence.cadenceAssumed).toBe(false);
  expect(result.usage.every((u) => u.subscriptionId === GYM_ID)).toBe(true);
}

describe("Req 4.8: cadence examples", () => {
  it("month-end: 01-31, 02-28, 03-31 is one monthly Series, no missed period", () => {
    expectOneMonthlySeries(["01-31", "02-28", "03-31"], { missedPeriods: 0 });
  });

  it("leap year: 2024-01-31, 2024-02-29, 2024-03-29 is one monthly Series", () => {
    expectOneMonthlySeries(["2024-01-31", "2024-02-29", "2024-03-29"], { missedPeriods: 0 });
  });

  it("01-30, 03-02, 03-30 is one monthly Series (03-02 is 2 days after 02-28)", () => {
    expectOneMonthlySeries(["01-30", "03-02", "03-30"], { missedPeriods: 0 });
  });

  it("weekend shift: 01-01, 02-02, 03-02 is one monthly Series", () => {
    expectOneMonthlySeries(["01-01", "02-02", "03-02"], { missedPeriods: 0 });
  });

  it("missed month: 01-15, 02-15, 04-15, 05-15 has missedPeriods 1", () => {
    expectOneMonthlySeries(["01-15", "02-15", "04-15", "05-15"], { missedPeriods: 1 });
  });

  it("retry, schedule continues: 01-15, 02-22, 03-15 lists 02-22 as late", () => {
    expectOneMonthlySeries(["01-15", "02-22", "03-15"], {
      missedPeriods: 0,
      lateChargeDates: ["2026-02-22"],
    });
  });

  it("retry, re-billed from the retry date: 01-15, 02-22, 03-22 lists 02-22 as late", () => {
    expectOneMonthlySeries(["01-15", "02-22", "03-22"], {
      missedPeriods: 0,
      lateChargeDates: ["2026-02-22"],
    });
  });
});

describe("Req 4.8: cadence examples (continued)", () => {
  it("11 days late: 01-15, 02-26, 03-26 gives a medium Series 02-26, 03-26 and leaves 01-15 out", () => {
    const result = run(charges(GYM, 999, ["01-15", "02-26", "03-26"]));
    expect(rolesOf(result)).toEqual([
      "not-recurring",
      "subscription-charge",
      "subscription-charge",
    ]);
    expect(result.subscriptions).toHaveLength(1);
    const sub = result.subscriptions[0] as Subscription;
    expect(sub.id).toBe(GYM_ID);
    expect(sub.cadence).toBe("monthly");
    expect(sub.confidence).toBe("medium");
    expect(sub.charges.map((c) => c.date)).toEqual(["2026-02-26", "2026-03-26"]);
    expect(sub.evidence.lateChargeDates).toEqual([]);
    expect(sub.evidence.missedPeriods).toBe(0);
  });

  it("shift across a month end: 01-27, 03-01, 03-27, 04-27 has missedPeriods 0", () => {
    expectOneMonthlySeries(["01-27", "03-01", "03-27", "04-27"], { missedPeriods: 0 });
  });

  it("gym billed on the 1st: 01-02, 02-02, 02-27, 04-01, 05-01 has missedPeriods 0", () => {
    expectOneMonthlySeries(["01-02", "02-02", "02-27", "04-01", "05-01"], { missedPeriods: 0 });
  });

  it("two charges two months apart: 01-15, 03-15 is no Series", () => {
    const result = run(charges(GYM, 999, ["01-15", "03-15"]));
    expect(result.subscriptions).toEqual([]);
    expect(rolesOf(result)).toEqual(["not-recurring", "not-recurring"]);
  });

  it("quarterly: 01-15, 04-15, 07-15 is no Series", () => {
    const result = run(charges(GYM, 999, ["01-15", "04-15", "07-15"]));
    expect(result.subscriptions).toEqual([]);
    expect(rolesOf(result)).toEqual(Array<TransactionRole>(3).fill("not-recurring"));
  });
});

describe("Req 5.4: a single known charge", () => {
  const rows = [charge("2026-03-01", 1549, NETFLIX), charge("2026-03-01", 999, NETFLIX)];

  function expectOnly999(input: NormalizedTransaction[], roles: TransactionRole[]) {
    const result = run(input);
    expect(rolesOf(result)).toEqual(roles);
    expect(summaries(result)).toEqual([
      {
        id: "sub:USD:monthly:*:netflix",
        cadence: "monthly",
        currentAmountCents: 999,
        yearlyCostCents: 11988,
        priceHistory: [{ date: "2026-03-01", amountCents: 999 }],
        status: "active",
        confidence: "low",
        chargeDates: ["2026-03-01"],
        regularChargeCount: 1,
        lateChargeDates: [],
        cadenceAssumed: true,
        introCharge: null,
      },
    ]);
    const sub = result.subscriptions[0] as Subscription;
    const subscriptionRow = input.findIndex((r) => r.amountCents === 999);
    expect(result.usage[subscriptionRow]?.subscriptionId).toBe(sub.id);
  }

  it("reports the 999 charge as one low-confidence Subscription (1549 first)", () => {
    expectOnly999(rows, ["not-recurring", "subscription-charge"]);
  });

  it("reports the same Subscription in the opposite input order", () => {
    expectOnly999([...rows].reverse(), ["subscription-charge", "not-recurring"]);
  });
});

describe("Req 5.6: one-off purchases next to a subscription at the same price", () => {
  it("keeps iCloud+ 99 x3 next to one app purchase at 99 (m = 4)", () => {
    const rows = [
      ...charges(APPLE, 99, ["01-12", "02-12", "03-12"]),
      charge("2026-01-20", 99, APPLE),
    ];
    const result = run(rows);
    expect(rolesOf(result)).toEqual([
      "subscription-charge",
      "subscription-charge",
      "subscription-charge",
      "not-recurring",
    ]);
    expect(summaries(result)).toEqual([
      {
        id: `sub:USD:monthly:*:${APPLE}`,
        cadence: "monthly",
        currentAmountCents: 99,
        yearlyCostCents: 1188,
        priceHistory: [{ date: "2026-01-12", amountCents: 99 }],
        status: "active",
        confidence: "high",
        chargeDates: ["2026-01-12", "2026-02-12", "2026-03-12"],
        regularChargeCount: 3,
        lateChargeDates: [],
        cadenceAssumed: false,
        introCharge: null,
      },
    ]);
  });

  it("reports nothing for iCloud+ 99 x3 plus app purchases on 01-20 and 02-25 (m = 5)", () => {
    const rows = [
      charge("2026-01-12", 99, APPLE),
      charge("2026-01-20", 99, APPLE),
      charge("2026-02-12", 99, APPLE),
      charge("2026-02-25", 99, APPLE),
      charge("2026-03-12", 99, APPLE),
    ];
    const result = run(rows);
    expect(result.subscriptions).toEqual([]);
    expect(rolesOf(result)).toEqual(Array<TransactionRole>(5).fill("not-recurring"));
    expect(result.usage.every((u) => u.subscriptionId === null)).toBe(true);
  });
});

describe("Req 7.5: active and ended", () => {
  const rows = charges(NETFLIX, 1549, ["2025-12-20", "01-20", "02-20"]);

  it("is active on 03-30, 10 days after the expected 03-20", () => {
    const result = detectSubscriptions(rows, { asOf: "2026-03-30" });
    expect(result.statement.asOf).toBe("2026-03-30");
    expect(result.statement.asOfSource).toBe("option");
    expect(result.subscriptions).toHaveLength(1);
    const sub = result.subscriptions[0] as Subscription;
    expect(sub.evidence.lastChargeDate).toBe("2026-02-20");
    expect(sub.evidence.nextExpectedDate).toBe("2026-03-20");
    expect(sub.evidence.cadenceAssumed).toBe(false);
    expect(sub.status).toBe("active");
  });

  it("is ended on 03-31, 11 days after the expected 03-20", () => {
    const result = detectSubscriptions(rows, { asOf: "2026-03-31" });
    expect(result.statement.asOf).toBe("2026-03-31");
    expect(result.statement.asOfSource).toBe("option");
    expect(result.subscriptions).toHaveLength(1);
    const sub = result.subscriptions[0] as Subscription;
    expect(sub.cadence).toBe("monthly");
    expect(sub.currentAmountCents).toBe(1549);
    expect(sub.yearlyCostCents).toBe(18588);
    expect(sub.status).toBe("ended");
  });
});

describe("Req 7.7 and 9.8: assumed cadence of a single known charge", () => {
  /** The single charge plus an unrelated purchase that sets the statement's last date. */
  function withStatementEnd(single: NormalizedTransaction, endDate: string) {
    return run([single, charge(endDate, 4500, "merchant:grocery")]);
  }

  it("Req 7.7: a charge on 2025-01-10 in a statement ending 2026-03-01 is yearly and ended", () => {
    const result = withStatementEnd(charge("2025-01-10", 1549, NETFLIX), "2026-03-01");
    expect(result.statement.asOf).toBe("2026-03-01");
    expect(result.statement.asOfSource).toBe("statement");
    expect(rolesOf(result)).toEqual(["subscription-charge", "not-recurring"]);
    expect(summaries(result)).toEqual([
      {
        id: "sub:USD:yearly:*:netflix",
        cadence: "yearly",
        currentAmountCents: 1549,
        yearlyCostCents: 1549,
        priceHistory: [{ date: "2025-01-10", amountCents: 1549 }],
        status: "ended",
        confidence: "low",
        chargeDates: ["2025-01-10"],
        regularChargeCount: 1,
        lateChargeDates: [],
        cadenceAssumed: true,
        introCharge: null,
      },
    ]);
  });

  it("Req 9.8: Amazon Prime 13900 on 03-20, statement ending 03-31, reads as monthly at 166800", () => {
    const result = withStatementEnd(charge("2026-03-20", 13900, "amazon-prime"), "2026-03-31");
    expect(rolesOf(result)).toEqual(["subscription-charge", "not-recurring"]);
    expect(summaries(result)).toEqual([
      {
        id: "sub:USD:monthly:*:amazon-prime",
        cadence: "monthly",
        currentAmountCents: 13900,
        yearlyCostCents: 166800,
        priceHistory: [{ date: "2026-03-20", amountCents: 13900 }],
        status: "active",
        confidence: "low",
        chargeDates: ["2026-03-20"],
        regularChargeCount: 1,
        lateChargeDates: [],
        cadenceAssumed: true,
        introCharge: null,
      },
    ]);
  });

  it("Req 9.8: Netflix 1549 on 01-02, statement ending 03-25, reads as yearly and active", () => {
    const result = withStatementEnd(charge("2026-01-02", 1549, NETFLIX), "2026-03-25");
    expect(rolesOf(result)).toEqual(["subscription-charge", "not-recurring"]);
    expect(summaries(result)).toEqual([
      {
        id: "sub:USD:yearly:*:netflix",
        cadence: "yearly",
        currentAmountCents: 1549,
        yearlyCostCents: 1549,
        priceHistory: [{ date: "2026-01-02", amountCents: 1549 }],
        status: "active",
        confidence: "low",
        chargeDates: ["2026-01-02"],
        regularChargeCount: 1,
        lateChargeDates: [],
        cadenceAssumed: true,
        introCharge: null,
      },
    ]);
  });
});

/** `count` dates, `step` days apart, from an ISO start date. */
function everyNDays(start: string, step: number, count: number): string[] {
  const first = dayNumber(
    Number(start.slice(0, 4)),
    Number(start.slice(5, 7)),
    Number(start.slice(8, 10)),
  );
  return Array.from({ length: count }, (_, i) => fromDayNumber(first + i * step).iso);
}

/** An unrelated purchase that only sets the statement range. */
function filler(date: string, name = "grocery") {
  return charge(d(date), 4500, `merchant:${name}`);
}

describe("Introduction: 4-weekly plans read as monthly", () => {
  it("NYT 2500 every 28 days from 01-01 to 12-31 is monthly at 30000 a year", () => {
    const dates = everyNDays("2026-01-01", 28, 14);
    expect(dates[0]).toBe("2026-01-01");
    expect(dates[13]).toBe("2026-12-31");
    const result = run(charges("merchant:nyt", 2500, dates));
    // 14 charges span 12 monthly periods, so one cannot be a separate monthly charge. The chain
    // keeps 10-08 -> 12-03 (2 days off the anchor date 12-01, Req 4.3) over 11-05 (3 days off).
    const roles = Array<TransactionRole>(14).fill("subscription-charge");
    expect(dates[11]).toBe("2026-11-05");
    roles[11] = "not-recurring";
    expect(rolesOf(result)).toEqual(roles);
    expect(summaries(result)).toEqual([
      {
        id: "sub:USD:monthly:*:merchant:nyt",
        cadence: "monthly",
        currentAmountCents: 2500,
        yearlyCostCents: 30000,
        priceHistory: [{ date: "2026-01-01", amountCents: 2500 }],
        status: "active",
        confidence: "high",
        chargeDates: dates.filter((_, i) => i !== 11),
        regularChargeCount: 13,
        lateChargeDates: [],
        cadenceAssumed: false,
        introCharge: null,
      },
    ]);
  });
});

describe("Introduction: other cadences are not detected", () => {
  it("reports no Subscription for a fortnightly generic plan", () => {
    const result = run(charges("merchant:fortnightly-plan", 1500, everyNDays("2026-01-02", 14, 8)));
    expect(result.subscriptions).toEqual([]);
    expect(rolesOf(result)).toEqual(Array<TransactionRole>(8).fill("not-recurring"));
  });

  it("reports no Subscription for a quarterly generic plan", () => {
    const result = run(
      charges("merchant:quarterly-plan", 4900, ["01-15", "04-15", "07-15", "10-15"]),
    );
    expect(result.subscriptions).toEqual([]);
    expect(rolesOf(result)).toEqual(Array<TransactionRole>(4).fill("not-recurring"));
  });

  it("reports quarterly Netflix 1549 as one low-confidence single charge for 07-15", () => {
    const rows = [...charges(NETFLIX, 1549, ["01-15", "04-15", "07-15"]), filler("07-20")];
    const result = run(rows);
    expect(result.statement.lastDate).toBe("2026-07-20");
    expect(rolesOf(result)).toEqual([
      "not-recurring",
      "not-recurring",
      "subscription-charge",
      "not-recurring",
    ]);
    expect(summaries(result)).toEqual([
      {
        id: "sub:USD:monthly:*:netflix",
        cadence: "monthly",
        currentAmountCents: 1549,
        yearlyCostCents: 18588,
        priceHistory: [{ date: "2026-07-15", amountCents: 1549 }],
        status: "active",
        confidence: "low",
        chargeDates: ["2026-07-15"],
        regularChargeCount: 1,
        lateChargeDates: [],
        cadenceAssumed: true,
        introCharge: null,
      },
    ]);
    expect(result.usage[2]?.subscriptionId).toBe("sub:USD:monthly:*:netflix");
  });
});

describe("Introduction: two accounts at one price", () => {
  const dates5 = ["01-05", "02-05", "03-05", "04-05"];
  const dates20 = ["01-20", "02-20", "03-20", "04-20"];
  /** Both accounts' charges in date order: 5th, 20th, 5th, 20th, ... */
  function twoAccounts(key: string) {
    return dates5.flatMap((date5, i) => [
      charge(d(date5), 1099, key),
      charge(d(dates20[i] as string), 1099, key),
    ]);
  }

  it("reports no Subscription for a generic merchant", () => {
    const result = run(twoAccounts("merchant:streaming-plan"));
    expect(result.subscriptions).toEqual([]);
    expect(rolesOf(result)).toEqual(Array<TransactionRole>(8).fill("not-recurring"));
  });

  it("reports Spotify as one low-confidence single charge, the latest one", () => {
    const result = run(twoAccounts("spotify"));
    expect(rolesOf(result)).toEqual([
      ...Array<TransactionRole>(7).fill("not-recurring"),
      "subscription-charge",
    ]);
    expect(summaries(result)).toEqual([
      {
        id: "sub:USD:monthly:*:spotify",
        cadence: "monthly",
        currentAmountCents: 1099,
        yearlyCostCents: 13188,
        priceHistory: [{ date: "2026-04-20", amountCents: 1099 }],
        status: "active",
        confidence: "low",
        chargeDates: ["2026-04-20"],
        regularChargeCount: 1,
        lateChargeDates: [],
        cadenceAssumed: true,
        introCharge: null,
      },
    ]);
  });
});

describe("Introduction: a replaced service", () => {
  it("joins Apple 1099 and 999 into one Series with a price history", () => {
    const rows = [
      ...charges(APPLE, 1099, ["2025-11-10", "2025-12-10", "01-10"]),
      ...charges(APPLE, 999, ["02-10", "03-10", "04-10"]),
    ];
    const result = run(rows);
    expect(rolesOf(result)).toEqual(Array<TransactionRole>(6).fill("subscription-charge"));
    expect(summaries(result)).toEqual([
      {
        id: `sub:USD:monthly:*:${APPLE}`,
        cadence: "monthly",
        currentAmountCents: 999,
        yearlyCostCents: 11988,
        priceHistory: [
          { date: "2025-11-10", amountCents: 1099 },
          { date: "2026-02-10", amountCents: 999 },
        ],
        status: "active",
        confidence: "high",
        chargeDates: [
          "2025-11-10",
          "2025-12-10",
          "2026-01-10",
          "2026-02-10",
          "2026-03-10",
          "2026-04-10",
        ],
        regularChargeCount: 6,
        lateChargeDates: [],
        cadenceAssumed: false,
        introCharge: null,
      },
    ]);
  });
});

describe("Introduction: charges converted from another currency", () => {
  it("reports no Subscription for GBP 775, 821, 798", () => {
    const rows = [
      charge("2026-01-15", 775, "merchant:us-plan", { currency: "GBP" }),
      charge("2026-02-15", 821, "merchant:us-plan", { currency: "GBP" }),
      charge("2026-03-15", 798, "merchant:us-plan", { currency: "GBP" }),
    ];
    const result = run(rows);
    expect(result.subscriptions).toEqual([]);
    expect(rolesOf(result)).toEqual(Array<TransactionRole>(3).fill("not-recurring"));
  });
});

describe("Introduction: a short statement", () => {
  it("reports no Subscription for one generic Fitzone charge in 01-01 to 01-31", () => {
    const result = run([
      filler("01-01", "coffee"),
      charge("2026-01-10", 2499, "merchant:fitzone-gym"),
      filler("01-31", "pharmacy"),
    ]);
    expect(result.statement.firstDate).toBe("2026-01-01");
    expect(result.statement.lastDate).toBe("2026-01-31");
    expect(result.subscriptions).toEqual([]);
    expect(rolesOf(result)).toEqual(Array<TransactionRole>(3).fill("not-recurring"));
  });
});

describe("Req 8.2 and 8.5: ids follow the amount or cadence they are built from", () => {
  function appleRows(musicCents: number) {
    return [
      ...charges(APPLE, musicCents, ["01-05", "02-05", "03-05"]),
      ...charges(APPLE, 99, ["01-12", "02-12", "03-12"]),
    ];
  }

  it("changes Apple Music's id from ...:1099:... to ...:1199:... and keeps iCloud+'s", () => {
    const first = run(appleRows(1099))
      .subscriptions.map((s) => s.id)
      .sort();
    const second = run(appleRows(1199))
      .subscriptions.map((s) => s.id)
      .sort();
    expect(first).toEqual([`sub:USD:monthly:1099:${APPLE}`, `sub:USD:monthly:99:${APPLE}`]);
    expect(second).toEqual([`sub:USD:monthly:1199:${APPLE}`, `sub:USD:monthly:99:${APPLE}`]);
  });

  it("changes a Netflix single charge's id from yearly to monthly once two more charges arrive", () => {
    const single = run([charge("2026-01-02", 1549, NETFLIX), filler("03-25")]);
    expect(single.subscriptions.map((s) => s.id)).toEqual(["sub:USD:yearly:*:netflix"]);

    const series = run([...charges(NETFLIX, 1549, ["01-02", "02-02", "03-02"]), filler("03-25")]);
    expect(series.subscriptions.map((s) => s.id)).toEqual(["sub:USD:monthly:*:netflix"]);
    expect(series.subscriptions[0]?.evidence.cadenceAssumed).toBe(false);
  });
});
