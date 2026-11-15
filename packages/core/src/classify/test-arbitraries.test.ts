import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseIsoDate } from "../detect/dates.js";
import type { Cadence, Subscription } from "../detect/types.js";
import { isBandRise } from "./band.js";
import { findInferredIntro, paidPriceHistory } from "./paid-history.js";
import {
  answersArb,
  classifierSubscriptionArb,
  classifierSubscriptionsArb,
  detectorOutputArb,
  MAX_AMOUNT_CENTS,
} from "./test-arbitraries.js";

// Literal factors on purpose: the check must not depend on `CADENCE_FACTOR`.
const FACTOR: Readonly<Record<Cadence, number>> = { weekly: 52, monthly: 12, yearly: 1 };

/** The step 5 invariants of design "Generators" (Req 11.1). Returns the broken ones. */
function brokenInvariants(s: Subscription): string[] {
  const broken: string[] = [];
  const e = s.evidence;
  const history = s.priceHistory;
  if (history.length === 0) broken.push("priceHistory empty");
  history.forEach((p, i) => {
    if (i > 0 && p.amountCents === (history[i - 1]?.amountCents ?? -1))
      broken.push("equal consecutive prices");
  });
  if (history[history.length - 1]?.amountCents !== s.currentAmountCents)
    broken.push("last price != current");
  if (s.yearlyCostCents !== s.currentAmountCents * FACTOR[s.cadence]) broken.push("yearly cost");
  if (!Number.isSafeInteger(s.yearlyCostCents)) broken.push("yearly cost not safe");
  s.charges.forEach((c, i) => {
    if (
      !Number.isSafeInteger(c.amountCents) ||
      c.amountCents < 1 ||
      c.amountCents > MAX_AMOUNT_CENTS
    ) {
      broken.push("amount out of range");
    }
    if (parseIsoDate(c.date) === null) broken.push("not a date");
    const previous = s.charges[i - 1];
    if (previous !== undefined && !(previous.date < c.date)) broken.push("dates not ascending");
  });
  const regular = s.charges.filter((c) => e.introCharge === null || c !== s.charges[0]);
  if (e.regularChargeCount !== regular.length) broken.push("regularChargeCount");
  if (!s.charges.some((c) => c.date === e.firstChargeDate))
    broken.push("no charge on firstChargeDate");
  const first = s.charges[0];
  const firstRegular = regular[0];
  if (e.introCharge !== null) {
    const h0 = history[0];
    if (h0?.date !== e.introCharge.date || h0.amountCents !== e.introCharge.amountCents) {
      broken.push("intro is not the first history entry");
    }
    if (first?.date !== e.introCharge.date) broken.push("intro date != charges[0].date");
    if (firstRegular === undefined || !(2 * e.introCharge.amountCents < firstRegular.amountCents)) {
      broken.push("intro not under half the first regular charge");
    }
  } else {
    const second = s.charges[1];
    const singleThenDifferent =
      first !== undefined && second !== undefined && first.amountCents !== second.amountCents;
    if (singleThenDifferent && s.source !== "known")
      broken.push("single first charge on a non-known source");
  }
  if (e.cadenceAssumed && (s.charges.length !== 1 || e.introCharge !== null))
    broken.push("assumed but not one charge");
  if (s.labels.length !== 0) broken.push("labels set");
  return broken;
}

describe("classifier generators: source (b)", () => {
  const sample = fc.sample(classifierSubscriptionArb, { numRuns: 2000, seed: 20260801 });

  it("keeps the detector's invariants in every sample", () => {
    for (const s of sample) expect(brokenInvariants(s), s.id).toEqual([]);
  });

  /** The first Paid price history amount and the price points after it. */
  function paid(s: Subscription) {
    return paidPriceHistory(s, findInferredIntro(s));
  }

  it("hits each case of Req 11.1", () => {
    const hit = {
      aboveBand: false,
      riseThenFallBack: false,
      inBandOnly: false,
      intro: false,
      inferred: false,
      freeTrialSameDay: false,
      manyFullChargesWithTrial: false,
      ended: false,
      assumed: false,
    };
    for (const s of sample) {
      const p = paid(s);
      const first = p[0]?.amountCents;
      if (first !== undefined && p.length >= 2) {
        if (isBandRise(first, s.currentAmountCents)) hit.aboveBand = true;
        const peak = p.some((x) => isBandRise(first, x.amountCents));
        if (peak && !isBandRise(first, s.currentAmountCents)) hit.riseThenFallBack = true;
        const steps = p
          .slice(1)
          .every((x, i) => !isBandRise(p[i]?.amountCents ?? 0, x.amountCents));
        if (steps && !peak) hit.inBandOnly = true;
      }
      const inferred = findInferredIntro(s);
      if (s.evidence.introCharge !== null) hit.intro = true;
      if (inferred !== null) hit.inferred = true;
      if (
        s.evidence.freeTrialDate !== null &&
        s.evidence.freeTrialDate === s.evidence.firstChargeDate
      ) {
        hit.freeTrialSameDay = true;
      }
      const fullCount =
        inferred !== null ? s.evidence.regularChargeCount - 1 : s.evidence.regularChargeCount;
      if (
        fullCount > 3 &&
        (s.evidence.introCharge !== null || inferred !== null || s.evidence.freeTrialDate !== null)
      ) {
        hit.manyFullChargesWithTrial = true;
      }
      if (s.status === "ended") hit.ended = true;
      if (s.evidence.cadenceAssumed) hit.assumed = true;
    }
    expect(hit).toEqual({
      aboveBand: true,
      riseThenFallBack: true,
      inBandOnly: true,
      intro: true,
      inferred: true,
      freeTrialSameDay: true,
      manyFullChargesWithTrial: true,
      ended: true,
      assumed: true,
    });
  });

  it("classifierSubscriptionsArb gives unique ids and some leftover labels", () => {
    const lists = fc.sample(classifierSubscriptionsArb, { numRuns: 300, seed: 7 });
    for (const list of lists) {
      expect(list.length).toBeLessThanOrEqual(8);
      expect(new Set(list.map((s) => s.id)).size).toBe(list.length);
    }
    expect(lists.some((list) => list.some((s) => s.labels.length > 0))).toBe(true);
    expect(lists.some((list) => list.length === 0)).toBe(true);
  });
});

describe("classifier generators: source (a)", () => {
  const sample = fc.sample(detectorOutputArb, { numRuns: 1000, seed: 20260802 });
  const all = sample.flat();

  it("reaches an intro charge, a free-trial date and an Inferred intro", () => {
    expect(all.some((s) => s.evidence.introCharge !== null)).toBe(true);
    expect(all.some((s) => s.evidence.freeTrialDate !== null)).toBe(true);
    expect(all.some((s) => findInferredIntro(s) !== null)).toBe(true);
  });
});

describe("answersArb", () => {
  it("gives Maps and, rarely, other values; Map values mix answers with other values", () => {
    const values = fc.sample(answersArb(["a", "b"]), { numRuns: 500, seed: 3 });
    expect(values.some((v) => v instanceof Map)).toBe(true);
    expect(values.some((v) => !(v instanceof Map))).toBe(true);
    const maps = values.filter((v): v is Map<unknown, unknown> => v instanceof Map);
    expect(maps.every((m) => m.size <= 10)).toBe(true);
    const entries = maps.flatMap((m) => [...m.entries()]);
    expect(entries.some(([k]) => k === "a")).toBe(true);
    expect(entries.some(([k]) => typeof k === "number")).toBe(true);
    expect(entries.some(([, v]) => v === "not-using")).toBe(true);
    expect(entries.some(([, v]) => v === "still-using")).toBe(true);
    expect(entries.some(([, v]) => v === "maybe" || v === null || v === 1 || v === undefined)).toBe(
      true,
    );
  });

  it("works with no ids", () => {
    expect(fc.sample(answersArb([]), { numRuns: 20, seed: 1 })).toHaveLength(20);
  });
});
