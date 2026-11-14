import { describe, expect, it } from "vitest";
import type { NormalizedTransaction } from "../normalize/types.js";
import { groupCharges } from "./bands.js";
import { buildSubscription } from "./build-subscription.js";
import { compareContent } from "./content-order.js";
import { parseIsoDate } from "./dates.js";
import type { CivilDate, Entry, Group, Interval, Series } from "./internal-types.js";
import { matchRefunds } from "./refunds.js";
import { charge, credit, zero } from "./test-fixtures.js";
import type { Cadence, StatementInfo } from "./types.js";
import { validateElement } from "./validate.js";

const NETFLIX = "netflix";
const GENERIC = "merchant:gym";

function entriesOf(rows: NormalizedTransaction[]): Entry[] {
  const valid: Omit<Entry, "rank">[] = [];
  rows.forEach((row, index) => {
    const result = validateElement(row, index);
    if (!result.ok) throw new Error(result.reason);
    valid.push(result.entry);
  });
  valid.sort(compareContent);
  return valid.map((entry, rank) => ({ ...entry, rank }));
}

function groupOf(rows: NormalizedTransaction[]): Group {
  const entries = entriesOf(rows);
  const { refunded, refunds } = matchRefunds(entries);
  const group = groupCharges(entries, refunded, refunds)[0];
  if (group === undefined) throw new Error("no group");
  return group;
}

function date(iso: string): CivilDate {
  const parsed = parseIsoDate(iso);
  if (parsed === null) throw new Error(`bad date ${iso}`);
  return parsed;
}

interface SeriesOptions {
  cadence?: Cadence;
  /** Number of leading rows that form the intro (0 or 1) */
  intro?: boolean;
}

/** A Series over all charges of the rows' Group; the first is the intro when `intro` is set. */
function seriesOf(rows: NormalizedTransaction[], options: SeriesOptions = {}): Series {
  const group = groupOf(rows);
  const all = [...group.charges];
  const intro = options.intro === true ? (all.shift() ?? null) : null;
  return {
    group,
    cadence: options.cadence ?? "monthly",
    regular: all,
    intervals: [],
    bandIds: [0],
    intro,
    cadenceAssumed: false,
    confidence: "high",
  };
}

function statementOf(firstDate: string | null = "2026-01-01"): StatementInfo {
  return { firstDate, lastDate: null, asOf: null, asOfSource: null, currencies: ["USD"] };
}

function build(series: Series, asOf = "2026-12-31") {
  const sub = buildSubscription(series, statementOf(), date(asOf));
  if (sub === null) throw new Error("unexpected overflow");
  return sub;
}

const MONTHLY_ROWS = [charge("2026-01-15", 1549, NETFLIX), charge("2026-02-15", 1549, NETFLIX)];

describe("buildSubscription: yearly cost (Req 6.1, 6.2, 6.5)", () => {
  it("multiplies the last Regular charge by 52, 12 or 1", () => {
    const weekly = seriesOf(
      [charge("2026-01-05", 500, GENERIC), charge("2026-01-12", 500, GENERIC)],
      {
        cadence: "weekly",
      },
    );
    const monthly = seriesOf(MONTHLY_ROWS);
    const yearly = seriesOf(
      [charge("2025-03-01", 9900, GENERIC), charge("2026-03-01", 9900, GENERIC)],
      { cadence: "yearly" },
    );
    expect(build(weekly).yearlyCostCents).toBe(26000);
    expect(build(monthly).yearlyCostCents).toBe(1549 * 12);
    expect(build(yearly).yearlyCostCents).toBe(9900);
    expect(build(monthly).currentAmountCents).toBe(1549);
  });

  it("uses the latest charge when the price changed", () => {
    const sub = build(
      seriesOf([
        charge("2026-01-15", 1549, NETFLIX),
        charge("2026-02-15", 1549, NETFLIX),
        charge("2026-03-15", 1799, NETFLIX),
      ]),
    );
    expect(sub.currentAmountCents).toBe(1799);
    expect(sub.yearlyCostCents).toBe(1799 * 12);
  });

  it("returns null for a monthly amount near MAX_SAFE_INTEGER / 12, but not for the same yearly amount", () => {
    const amount = Math.floor(Number.MAX_SAFE_INTEGER / 12) + 1;
    const rows = [charge("2025-03-01", amount, GENERIC), charge("2026-03-01", amount, GENERIC)];
    expect(Number.isSafeInteger(amount)).toBe(true);
    expect(
      buildSubscription(seriesOf(rows, { cadence: "monthly" }), statementOf(), date("2026-03-02")),
    ).toBeNull();
    const yearly = build(seriesOf(rows, { cadence: "yearly" }), "2026-03-02");
    expect(yearly.yearlyCostCents).toBe(amount);
  });

  it("accepts the largest amount whose monthly yearly cost is still safe", () => {
    const amount = Math.floor(Number.MAX_SAFE_INTEGER / 12);
    const rows = [charge("2025-03-01", amount, GENERIC), charge("2026-03-01", amount, GENERIC)];
    const sub = build(seriesOf(rows, { cadence: "monthly" }), "2026-03-02");
    expect(sub.yearlyCostCents).toBe(amount * 12);
  });
});

describe("buildSubscription: priceHistory (Req 6.3, 6.4)", () => {
  it("has one entry for a constant price", () => {
    expect(build(seriesOf(MONTHLY_ROWS)).priceHistory).toEqual([
      { date: "2026-01-15", amountCents: 1549 },
    ]);
  });

  it("starts with the intro charge and adds the Regular price", () => {
    const sub = build(
      seriesOf(
        [
          charge("2026-01-10", 100, NETFLIX),
          charge("2026-02-10", 1499, NETFLIX),
          charge("2026-03-10", 1499, NETFLIX),
        ],
        { intro: true },
      ),
    );
    expect(sub.priceHistory).toEqual([
      { date: "2026-01-10", amountCents: 100 },
      { date: "2026-02-10", amountCents: 1499 },
    ]);
    expect(sub.charges.map((c) => c.amountCents)).toEqual([100, 1499, 1499]);
  });

  it("gives two entries for 1549, 1549, 1799", () => {
    const sub = build(
      seriesOf([
        charge("2026-01-15", 1549, NETFLIX),
        charge("2026-02-15", 1549, NETFLIX),
        charge("2026-03-15", 1799, NETFLIX),
      ]),
    );
    expect(sub.priceHistory).toEqual([
      { date: "2026-01-15", amountCents: 1549 },
      { date: "2026-03-15", amountCents: 1799 },
    ]);
  });

  it("ends with currentAmountCents", () => {
    const sub = build(
      seriesOf([
        charge("2026-01-15", 1549, NETFLIX),
        charge("2026-02-15", 1799, NETFLIX),
        charge("2026-03-15", 1549, NETFLIX),
      ]),
    );
    expect(sub.priceHistory.map((p) => p.amountCents)).toEqual([1549, 1799, 1549]);
    expect(sub.priceHistory[sub.priceHistory.length - 1]?.amountCents).toBe(sub.currentAmountCents);
  });
});

describe("buildSubscription: charges and identity (Req 1.6, 1.7, 1.12)", () => {
  it("copies charges into fresh objects with exactly the 9 fields", () => {
    const rows = [
      { ...charge("2026-01-15", 1549, NETFLIX), extra: "leak" } as NormalizedTransaction,
      charge("2026-02-15", 1549, NETFLIX),
    ];
    const series = seriesOf(rows);
    const sub = build(series);
    expect(sub.charges).toHaveLength(2);
    for (const copy of sub.charges) {
      expect(Object.keys(copy).sort()).toEqual(
        ["amountCents", "currency", "date", "description", "merchant"].sort(),
      );
      expect(Object.keys(copy.merchant).sort()).toEqual(
        ["displayName", "key", "processor", "serviceId", "source"].sort(),
      );
    }
    expect(JSON.stringify(sub)).not.toContain("leak");
    for (const copy of sub.charges) {
      for (const row of rows) {
        expect(copy).not.toBe(row);
        expect(copy.merchant).not.toBe(row.merchant);
      }
    }
    expect(sub.charges[0]).toEqual({ ...rows[0], extra: undefined });
  });

  it("returns fresh arrays and objects on every call", () => {
    const series = seriesOf(MONTHLY_ROWS);
    const a = build(series);
    const b = build(series);
    expect(a.charges).not.toBe(b.charges);
    expect(a.charges[0]).not.toBe(b.charges[0]);
    expect(a.priceHistory).not.toBe(b.priceHistory);
    expect(a.evidence).not.toBe(b.evidence);
  });

  it("uses the displayName of the last charge", () => {
    const sub = build(
      seriesOf([
        charge("2026-01-15", 1549, NETFLIX, { displayName: "Netflix Old" }),
        charge("2026-02-15", 1549, NETFLIX, { displayName: "Netflix New" }),
      ]),
    );
    expect(sub.merchant).toBe("Netflix New");
  });

  it("takes merchantKey, serviceId, source and currency from the Group", () => {
    const known = build(seriesOf(MONTHLY_ROWS));
    expect(known).toMatchObject({
      merchantKey: NETFLIX,
      serviceId: NETFLIX,
      source: "known",
      currency: "USD",
      cadence: "monthly",
      confidence: "high",
    });
    const generic = build(
      seriesOf([
        charge("2026-01-15", 999, GENERIC, { currency: "EUR" }),
        charge("2026-02-15", 999, GENERIC, { currency: "EUR" }),
      ]),
    );
    expect(generic).toMatchObject({
      merchantKey: GENERIC,
      serviceId: null,
      source: "generic",
      currency: "EUR",
    });
  });

  it("has no labels and no cancel property", () => {
    const sub = build(seriesOf(MONTHLY_ROWS));
    expect(sub.labels).toEqual([]);
    expect("cancel" in sub).toBe(false);
    expect("id" in sub).toBe(false);
  });
});

describe("buildSubscription: status (Req 7.5, 7.6, 7.8)", () => {
  const feb20 = [charge("2026-01-20", 999, GENERIC), charge("2026-02-20", 999, GENERIC)];

  it("monthly: active on next + 10 days, ended one day later", () => {
    expect(build(seriesOf(feb20), "2026-03-30").status).toBe("active");
    expect(build(seriesOf(feb20), "2026-03-31").status).toBe("ended");
  });

  it("weekly: grace 2", () => {
    const rows = [charge("2026-01-05", 500, GENERIC), charge("2026-01-12", 500, GENERIC)];
    const series = seriesOf(rows, { cadence: "weekly" });
    expect(build(series, "2026-01-21").status).toBe("active");
    expect(build(series, "2026-01-22").status).toBe("ended");
  });

  it("yearly: grace 7", () => {
    const rows = [charge("2025-03-01", 9900, GENERIC), charge("2026-03-01", 9900, GENERIC)];
    const series = seriesOf(rows, { cadence: "yearly" });
    expect(build(series, "2027-03-08").status).toBe("active");
    expect(build(series, "2027-03-09").status).toBe("ended");
  });

  it("is active when the As-of date is before the last Regular charge", () => {
    expect(build(seriesOf(feb20), "2026-01-01").status).toBe("active");
    expect(build(seriesOf(feb20), "1999-01-01").status).toBe("active");
  });

  it("keeps the last price of an ended Subscription", () => {
    const sub = build(
      seriesOf([charge("2026-01-15", 1549, NETFLIX), charge("2026-02-15", 1799, NETFLIX)]),
      "2027-01-01",
    );
    expect(sub.status).toBe("ended");
    expect(sub.currentAmountCents).toBe(1799);
    expect(sub.yearlyCostCents).toBe(1799 * 12);
  });

  it("uses the assumed cadence of a single known charge (Req 7.7)", () => {
    const group = groupOf([charge("2025-01-10", 1549, NETFLIX)]);
    const series: Series = {
      group,
      cadence: "yearly",
      regular: [...group.charges],
      intervals: [],
      bandIds: [0],
      intro: null,
      cadenceAssumed: true,
      confidence: "low",
    };
    expect(build(series, "2026-01-17").status).toBe("active");
    expect(build(series, "2026-01-18").status).toBe("ended");
    expect(build(series, "2026-03-01").confidence).toBe("low");
  });
});

/** The Series of `key`'s Group in `rows`; the first charge is the intro when `intro` is set. */
function evidenceSeries(
  rows: NormalizedTransaction[],
  key: string,
  options: SeriesOptions & { intervals?: Interval[]; cadenceAssumed?: boolean } = {},
): Series {
  const entries = entriesOf(rows);
  const { refunded, refunds } = matchRefunds(entries);
  const group = groupCharges(entries, refunded, refunds).find((g) => g.key === key);
  if (group === undefined) throw new Error("no group");
  const regular = [...group.charges];
  const intro = options.intro === true ? (regular.shift() ?? null) : null;
  return {
    group,
    cadence: options.cadence ?? "monthly",
    regular,
    intervals: options.intervals ?? [],
    bandIds: [0],
    intro,
    cadenceAssumed: options.cadenceAssumed ?? false,
    confidence: "high",
  };
}

function evidenceOf(series: Series, firstDate: string | null = "2026-01-01", asOf = "2026-12-31") {
  const sub = buildSubscription(series, statementOf(firstDate), date(asOf));
  if (sub === null) throw new Error("unexpected overflow");
  return sub.evidence;
}

const ON_TIME: Interval = { k: 1, kind: "on-schedule", deviation: 0 };
const MISSED: Interval = { k: 2, kind: "on-schedule", deviation: 0 };
const LATE: Interval = { k: 1, kind: "late", deviation: 7 };

describe("buildSubscription: basic evidence (Req 9.1, 9.3, 9.4)", () => {
  it("reports counts, dates, next date and the intro charge", () => {
    const series = evidenceSeries(
      [
        charge("2026-01-10", 100, NETFLIX),
        charge("2026-02-10", 1499, NETFLIX),
        charge("2026-03-10", 1499, NETFLIX),
      ],
      NETFLIX,
      { intro: true, intervals: [ON_TIME] },
    );
    expect(evidenceOf(series)).toEqual({
      regularChargeCount: 2,
      firstChargeDate: "2026-02-10",
      lastChargeDate: "2026-03-10",
      nextExpectedDate: "2026-04-10",
      missedPeriods: 0,
      lateChargeDates: [],
      cadenceAssumed: false,
      introCharge: { date: "2026-01-10", amountCents: 100 },
      freeTrialDate: null,
      // the intro (2026-01-10) is within one month plus 3 days of firstDate 2026-01-01
      startedInStatement: false,
      partialRefunds: [],
    });
  });

  it("has a null introCharge without an intro", () => {
    expect(evidenceOf(evidenceSeries(MONTHLY_ROWS, NETFLIX)).introCharge).toBeNull();
  });

  it("is true for cadenceAssumed only when the Series says so", () => {
    const rows = [charge("2025-01-10", 1549, NETFLIX)];
    expect(evidenceOf(evidenceSeries(rows, NETFLIX)).cadenceAssumed).toBe(false);
    expect(
      evidenceOf(evidenceSeries(rows, NETFLIX, { cadence: "yearly", cadenceAssumed: true }))
        .cadenceAssumed,
    ).toBe(true);
  });

  it("gives a 5-digit year for the next date of a charge in year 9999", () => {
    const rows = [charge("9999-11-15", 999, GENERIC), charge("9999-12-15", 999, GENERIC)];
    const evidence = evidenceOf(evidenceSeries(rows, GENERIC), "9999-11-01", "9999-12-20");
    expect(evidence.nextExpectedDate).toBe("10000-01-15");
  });
});

describe("buildSubscription: missed and late charges (Req 4.5, 4.6)", () => {
  it("counts one missed period for Jan 15, Feb 15, Apr 15, May 15", () => {
    const series = evidenceSeries(
      [
        charge("2026-01-15", 999, GENERIC),
        charge("2026-02-15", 999, GENERIC),
        charge("2026-04-15", 999, GENERIC),
        charge("2026-05-15", 999, GENERIC),
      ],
      GENERIC,
      { intervals: [ON_TIME, MISSED, ON_TIME] },
    );
    const evidence = evidenceOf(series);
    expect(evidence.missedPeriods).toBe(1);
    expect(evidence.lateChargeDates).toEqual([]);
  });

  it("lists the late charge dates of the retry row, ascending", () => {
    const series = evidenceSeries(
      [
        charge("2026-01-15", 999, GENERIC),
        charge("2026-02-22", 999, GENERIC),
        charge("2026-03-15", 999, GENERIC),
        charge("2026-04-23", 999, GENERIC),
      ],
      GENERIC,
      { intervals: [LATE, ON_TIME, LATE] },
    );
    const evidence = evidenceOf(series);
    expect(evidence.lateChargeDates).toEqual(["2026-02-22", "2026-04-23"]);
    expect(evidence.missedPeriods).toBe(0);
  });
});

describe("buildSubscription: freeTrialDate (Req 2.3, 9.5)", () => {
  const rowsWith = (...extra: NormalizedTransaction[]) => [
    ...extra,
    charge("2026-03-15", 999, GENERIC),
    charge("2026-04-15", 999, GENERIC),
  ];
  const trial = (rows: NormalizedTransaction[]) =>
    evidenceOf(evidenceSeries(rows, GENERIC)).freeTrialDate;

  it("uses a zero row exactly one Period plus Tolerance before the first charge", () => {
    // addMonths(2026-03-15, -1) = 2026-02-15; minus 3 days = 2026-02-12
    expect(trial(rowsWith(zero("2026-02-12", GENERIC)))).toBe("2026-02-12");
  });

  it("ignores a zero row one day earlier", () => {
    expect(trial(rowsWith(zero("2026-02-11", GENERIC)))).toBeNull();
  });

  it("uses a zero row on the date of the first charge", () => {
    expect(trial(rowsWith(zero("2026-03-15", GENERIC)))).toBe("2026-03-15");
  });

  it("ignores a zero row after the first charge", () => {
    expect(trial(rowsWith(zero("2026-03-16", GENERIC)))).toBeNull();
  });

  it("uses the latest of two qualifying rows", () => {
    expect(trial(rowsWith(zero("2026-02-13", GENERIC), zero("2026-03-01", GENERIC)))).toBe(
      "2026-03-01",
    );
  });

  it("ignores a zero row of another Group", () => {
    const rows = rowsWith(zero("2026-03-01", "merchant:other"));
    expect(trial(rows)).toBeNull();
  });

  it("measures from the intro when there is one", () => {
    const rows = [
      zero("2026-01-12", NETFLIX),
      charge("2026-01-15", 100, NETFLIX),
      charge("2026-02-15", 1499, NETFLIX),
      charge("2026-03-15", 1499, NETFLIX),
    ];
    const evidence = evidenceOf(evidenceSeries(rows, NETFLIX, { intro: true }));
    expect(evidence.freeTrialDate).toBe("2026-01-12");
  });

  it("does not change the charges or the price history", () => {
    const rows = rowsWith(zero("2026-03-01", GENERIC));
    const sub = buildSubscription(evidenceSeries(rows, GENERIC), statementOf(), date("2026-12-31"));
    expect(sub?.charges).toHaveLength(2);
    expect(sub?.priceHistory).toEqual([{ date: "2026-03-15", amountCents: 999 }]);
  });
});

describe("buildSubscription: startedInStatement (Req 9.6)", () => {
  // firstDate 2026-01-02, monthly: addMonths = 2026-02-02, plus 3 = 2026-02-05
  const started = (firstCharge: string, intro = false) => {
    const rows = intro
      ? [
          charge(firstCharge, 100, NETFLIX),
          charge("2026-03-20", 1499, NETFLIX),
          charge("2026-04-20", 1499, NETFLIX),
        ]
      : [charge(firstCharge, 999, GENERIC), charge("2026-04-05", 999, GENERIC)];
    const series = evidenceSeries(rows, intro ? NETFLIX : GENERIC, { intro });
    return evidenceOf(series, "2026-01-02").startedInStatement;
  };

  it("is false for a first charge on 2026-02-05", () => {
    expect(started("2026-02-05")).toBe(false);
  });

  it("is true for a first charge on 2026-02-06", () => {
    expect(started("2026-02-06")).toBe(true);
  });

  it("uses the intro as the earliest charge", () => {
    expect(started("2026-02-05", true)).toBe(false);
    expect(started("2026-02-06", true)).toBe(true);
  });

  it("is false when the statement has no first date", () => {
    expect(evidenceOf(evidenceSeries(MONTHLY_ROWS, NETFLIX), null).startedInStatement).toBe(false);
  });

  it("uses the cadence of the Series", () => {
    const rows = [charge("2026-01-20", 900, GENERIC), charge("2027-01-20", 900, GENERIC)];
    const series = evidenceSeries(rows, GENERIC, { cadence: "yearly" });
    // addMonths(2026-01-02, 12) + 7 = 2027-01-09
    expect(evidenceOf(series, "2026-01-02").startedInStatement).toBe(false);
    expect(evidenceOf(series, "2025-01-02").startedInStatement).toBe(true);
  });
});

describe("buildSubscription: partialRefunds (Req 9.7)", () => {
  // Regular charges 2026-02-01 and 2026-03-01; the last is 2026-03-01, + 45 days = 2026-04-15
  const rows = (...extra: NormalizedTransaction[]) => [
    ...extra,
    charge("2026-02-01", 1000, GENERIC),
    charge("2026-03-01", 1000, GENERIC),
  ];
  const refunds = (list: NormalizedTransaction[]) =>
    evidenceOf(evidenceSeries(list, GENERIC)).partialRefunds;

  it("includes a Credit 45 days after the last Regular charge", () => {
    expect(refunds(rows(credit("2026-04-15", 300, GENERIC)))).toEqual([
      { date: "2026-04-15", amountCents: -300 },
    ]);
  });

  it("excludes a Credit 46 days after the last Regular charge", () => {
    expect(refunds(rows(credit("2026-04-16", 300, GENERIC)))).toEqual([]);
  });

  it("excludes a Credit one day before the earliest charge", () => {
    expect(refunds(rows(credit("2026-01-31", 300, GENERIC)))).toEqual([]);
  });

  it("includes a Credit on the date of the earliest charge", () => {
    expect(refunds(rows(credit("2026-02-01", 300, GENERIC)))).toEqual([
      { date: "2026-02-01", amountCents: -300 },
    ]);
  });

  it("lists Credits ascending with negative amounts and skips other Groups", () => {
    const list = rows(
      credit("2026-03-10", 200, GENERIC),
      credit("2026-02-10", 100, GENERIC),
      credit("2026-02-12", 100, "merchant:other"),
    );
    expect(refunds(list)).toEqual([
      { date: "2026-02-10", amountCents: -100 },
      { date: "2026-03-10", amountCents: -200 },
    ]);
  });

  it("leaves a full refund out, because it is not money-in", () => {
    const list = [
      charge("2026-02-01", 1000, GENERIC),
      charge("2026-03-01", 1000, GENERIC),
      charge("2026-04-01", 1000, GENERIC),
      credit("2026-04-10", 1000, GENERIC),
    ];
    expect(refunds(list)).toEqual([]);
  });

  it("measures from the intro when there is one", () => {
    const list = [
      credit("2026-01-20", 50, NETFLIX),
      charge("2026-01-15", 100, NETFLIX),
      charge("2026-02-15", 1499, NETFLIX),
      charge("2026-03-15", 1499, NETFLIX),
    ];
    const evidence = evidenceOf(evidenceSeries(list, NETFLIX, { intro: true }));
    expect(evidence.partialRefunds).toEqual([{ date: "2026-01-20", amountCents: -50 }]);
  });
});
