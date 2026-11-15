// Test-only generators for the subscription classifier (design "Generators"). Not part of the
// build: tsconfig.build.json excludes `test-*.ts`. Only tests import this file.
//
// Source (a) of Req 11.1 is detector output; source (b) is `classifierSubscriptionArb`, which
// builds Subscriptions that keep the detector's invariants without running the detector.

import fc from "fast-check";
import { addMonths, dayNumber, fromDayNumber, parseIsoDate } from "../detect/dates.js";
import { detectSubscriptions } from "../detect/detect-subscriptions.js";
import {
  monthlySeriesArb,
  unrelatedChargesArb,
  validTxArb,
  weeklySeriesArb,
  yearlyPairArb,
} from "../detect/test-arbitraries.js";
import { charge, zero } from "../detect/test-fixtures.js";
import type { Cadence, Subscription } from "../detect/types.js";
import type { MerchantSource, NormalizedTransaction } from "../normalize/types.js";
import { classifySubscriptions } from "./classify-subscriptions.js";
import { makeSubscription } from "./test-fixtures.js";
import type { UsageAnswer } from "./types.js";

/** Largest amount of source (b): `yearlyCostCents` stays a safe integer for every cadence. */
export const MAX_AMOUNT_CENTS = Math.floor(Number.MAX_SAFE_INTEGER / 52);

const CURRENCIES: readonly string[] = ["USD", "GBP", "EUR"];

const KEYS: Readonly<Record<MerchantSource, readonly string[]>> = {
  known: ["netflix", "spotify", "hulu"],
  generic: ["merchant:gym", "merchant:coffee"],
  unidentified: ["unidentified:none:acme 123", "unidentified:paypal:shop 77"],
};

// --- Source (b): step 2, the price shapes ------------------------------------------------------

/** The amounts of one price shape, one per level; consecutive levels differ. */
type Levels = readonly number[];

/** Smallest amount that is a Band rise above `from`: `(to − from) × 20 > from`. */
function minRiseAbove(from: number): number {
  return from + Math.floor(from / 20) + 1;
}

/** An amount from 1 to `MAX_AMOUNT_CENTS`, with a branch of small amounts. */
const amountArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 50, max: 5000 }) },
  { weight: 1, arbitrary: fc.integer({ min: 1, max: MAX_AMOUNT_CENTS }) },
);

/** `a`, kept at most half of the maximum so that every shape has room above it. */
const baseArb: fc.Arbitrary<number> = amountArb.map((a) =>
  Math.min(a, Math.floor(MAX_AMOUNT_CENTS / 2)),
);

/** A Band rise above `from`, at most `MAX_AMOUNT_CENTS`, picked by a permille of the room. */
function riseFrom(from: number, permille: number): number {
  const low = minRiseAbove(from);
  const room = MAX_AMOUNT_CENTS - low;
  return low + Math.floor(room / 1000) * permille;
}

const permilleArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 5 }) },
  { weight: 1, arbitrary: fc.integer({ min: 0, max: 1000 }) },
);

/** Drops a level equal to the one before it. */
function distinctRuns(levels: readonly number[]): number[] {
  const out: number[] = [];
  for (const level of levels) if (out[out.length - 1] !== level) out.push(level);
  return out;
}

const constantShapeArb: fc.Arbitrary<Levels> = fc.oneof(amountArb, baseArb).map((a) => [a]);

const inBandStepShapeArb: fc.Arbitrary<Levels> = fc
  .tuple(baseArb, fc.boolean(), fc.nat(1000))
  .map(([a, down, k]) => {
    const band = Math.floor(a / 20);
    if (band < 1) return [a];
    const delta = 1 + (k % band);
    return [a, down ? a - delta : a + delta];
  });

const bandRiseShapeArb: fc.Arbitrary<Levels> = fc
  .tuple(baseArb, permilleArb)
  .map(([a, p]) => [a, riseFrom(a, p)]);

const riseThenFallBackShapeArb: fc.Arbitrary<Levels> = fc
  .tuple(baseArb, permilleArb, fc.boolean(), fc.nat(1000))
  .map(([a, p, down, k]) => {
    const band = Math.floor(a / 20);
    const up = riseFrom(a, p);
    if (band < 1) return [a, up];
    const delta = 1 + (k % band);
    return [a, up, down ? a - delta : a + delta];
  });

const riseThenFallAboveShapeArb: fc.Arbitrary<Levels> = fc
  .tuple(baseArb, permilleArb, permilleArb)
  .map(([a, p1, p2]) => [a, riseFrom(a, p1), riseFrom(a, p2)]);

const fallThenRiseShapeArb: fc.Arbitrary<Levels> = fc
  .tuple(baseArb, fc.nat(1000), permilleArb)
  .map(([a, k, p]) => (a < 2 ? [a, riseFrom(a, p)] : [a, 1 + (k % (a - 1)), riseFrom(a, p)]));

const inBandStairShapeArb: fc.Arbitrary<Levels> = fc
  .tuple(baseArb, fc.integer({ min: 3, max: 9 }))
  .map(([a, steps]) => {
    const out = [Math.max(a, 40)];
    for (let i = 0; i < steps; i += 1) {
      const x = out[out.length - 1] as number;
      const next = x + Math.max(1, Math.floor(x / 20));
      if (next <= MAX_AMOUNT_CENTS) out.push(next);
    }
    return out;
  });

const randomShapeArb: fc.Arbitrary<Levels> = fc
  .array(fc.oneof(amountArb, fc.integer({ min: 1, max: 40 })), { minLength: 1, maxLength: 5 })
  .map(distinctRuns);

const shapeArb: fc.Arbitrary<Levels> = fc.oneof(
  constantShapeArb,
  inBandStepShapeArb,
  bandRiseShapeArb,
  riseThenFallBackShapeArb,
  riseThenFallAboveShapeArb,
  fallThenRiseShapeArb,
  inBandStairShapeArb,
  randomShapeArb,
);

// --- Source (b): steps 1, 3, 4, 6 and the assembly (step 5 is `makeSubscription`) ---------------

interface RawDraw {
  cadence: Cadence;
  currency: string;
  source: MerchantSource;
  keySeed: number;
  step: 7 | 30 | 365;
  baseDay: number;
  levels: Levels;
  counts: readonly number[];
  introKind: "none" | "intro" | "inferred";
  introSeed: number;
  startedInStatement: boolean;
  ended: boolean;
  freeKind: "none" | "before" | "same";
  freeOffset: number;
  assumed: boolean;
  confidence: "high" | "medium";
}

const rawArb: fc.Arbitrary<RawDraw> = fc.record({
  cadence: fc.constantFrom<Cadence>("weekly", "monthly", "yearly"),
  currency: fc.constantFrom(...CURRENCIES),
  source: fc.constantFrom<MerchantSource>("known", "generic", "unidentified"),
  keySeed: fc.nat(1000),
  step: fc.constantFrom<7 | 30 | 365>(7, 30, 365),
  baseDay: fc
    .tuple(
      fc.integer({ min: 2020, max: 2026 }),
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 1, max: 28 }),
    )
    .map(([y, m, d]) => dayNumber(y, m, d)),
  levels: shapeArb,
  counts: fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 9, maxLength: 9 }),
  introKind: fc.constantFrom<"none" | "intro" | "inferred">(
    "none",
    "none",
    "intro",
    "inferred",
    "inferred",
  ),
  introSeed: fc.integer({ min: 0, max: 1_000_000 }),
  startedInStatement: fc.boolean(),
  ended: fc.oneof(fc.constant(false), fc.constant(false), fc.constant(false), fc.constant(true)),
  freeKind: fc.constantFrom<"none" | "before" | "same">("none", "none", "before", "same"),
  freeOffset: fc.integer({ min: 1, max: 40 }),
  assumed: fc.oneof(...Array.from({ length: 9 }, () => fc.constant(false)), fc.constant(true)),
  confidence: fc.constantFrom<"high" | "medium">("high", "medium"),
});

/** Amount of a Band-rise-free "near" price for the Inferred intro: `2 × p0 ≥ first`, `p0 ≠ first`. */
function inferredIntroAmount(first: number, seed: number): number {
  const lowest = Math.ceil(first / 2);
  const span = Math.min(first, MAX_AMOUNT_CENTS - lowest);
  const p0 = lowest + (seed % (span + 1));
  if (p0 !== first) return p0;
  return first > lowest ? first - 1 : first + 1 <= MAX_AMOUNT_CENTS ? first + 1 : first;
}

function buildSubscription(raw: RawDraw): Subscription {
  const keys = KEYS[raw.source];
  const merchantKey = keys[raw.keySeed % keys.length] as string;
  const levels = raw.assumed ? [raw.levels[0] as number] : [...raw.levels];
  const first = levels[0] as number;

  // Step 3: an intro, or (known only) a single first charge at a nearby different price.
  let introAmount: number | null = null;
  let singleFirst: number | null = null;
  if (!raw.assumed && raw.introKind === "intro" && first >= 3) {
    introAmount = 1 + (raw.introSeed % Math.floor((first - 1) / 2));
  } else if (!raw.assumed && raw.introKind === "inferred" && raw.source === "known") {
    const p0 = inferredIntroAmount(first, raw.introSeed);
    if (p0 !== first && 2 * p0 >= first) singleFirst = p0;
  }

  // Charges per level; without an intro a non-known first level that is followed by another
  // level needs two charges (detector Req 3.6 joins a one-charge Segment only for known Groups).
  const amounts: number[] = [];
  const plan: number[] = singleFirst === null ? levels : [singleFirst, ...levels];
  plan.forEach((amount, i) => {
    let count = raw.assumed ? 1 : (raw.counts[i % raw.counts.length] as number);
    if (singleFirst !== null && i === 0) count = 1;
    if (
      introAmount === null &&
      singleFirst === null &&
      i === 0 &&
      plan.length > 1 &&
      raw.source !== "known"
    ) {
      count = Math.max(2, count);
    }
    for (let k = 0; k < count; k += 1) amounts.push(amount);
  });

  const introCount = introAmount === null ? 0 : 1;
  const dateAt = (i: number): string => fromDayNumber(raw.baseDay + i * raw.step).iso;
  const charges = amounts.map((amount, i): [string, number] => [dateAt(i + introCount), amount]);
  const firstChargeDay = raw.baseDay + introCount * raw.step;

  let freeTrialDate: string | null = null;
  if (raw.freeKind === "same") freeTrialDate = fromDayNumber(firstChargeDay).iso;
  else if (raw.freeKind === "before")
    freeTrialDate = fromDayNumber(firstChargeDay - raw.freeOffset).iso;

  const built = makeSubscription({
    cadence: raw.cadence,
    currency: raw.currency,
    source: raw.source,
    merchantKey,
    charges,
    ...(introAmount === null ? {} : { intro: [dateAt(0), introAmount] as const }),
    freeTrialDate,
    startedInStatement: raw.startedInStatement,
    status: raw.ended ? "ended" : "active",
    cadenceAssumed: raw.assumed,
  });
  return { ...built, confidence: raw.assumed ? "low" : raw.confidence };
}

/** Source (b) of Req 11.1: one Subscription that keeps the detector's invariants. */
export const classifierSubscriptionArb: fc.Arbitrary<Subscription> = rawArb.map(buildSubscription);

function withIndex(s: Subscription, i: number): Subscription {
  return { ...s, id: `sub:${s.currency}:${s.cadence}:${i}:${s.merchantKey}` };
}

/**
 * 0 to 8 Subscriptions with unique ids. One branch carries leftover `labels`, `priceRise` and
 * `trial` from an earlier classification with random answers (Req 1.6).
 */
export const classifierSubscriptionsArb: fc.Arbitrary<Subscription[]> = fc
  .tuple(
    fc.array(classifierSubscriptionArb, { maxLength: 8 }),
    fc.boolean(),
    fc.array(fc.boolean(), { maxLength: 8 }),
  )
  .map(([list, leftovers, notUsing]) => {
    const subs = list.map(withIndex);
    if (!leftovers) return subs;
    const answers = new Map<string, UsageAnswer>();
    subs.forEach((s, i) => {
      if (notUsing[i] === true) answers.set(s.id, "not-using");
    });
    return classifySubscriptions(subs, answers);
  });

// --- Source (a): detector output ---------------------------------------------------------------

/** Dates of `count` monthly charges from `first`, as the detector's fixtures write them. */
function monthlyDates(first: string, count: number): string[] {
  const start = parseIsoDate(first);
  if (start === null) throw new Error(`not an ISO date: ${first}`);
  return Array.from({ length: count }, (_, i) => addMonths(start, i).iso);
}

const handMadeRowsArb: fc.Arbitrary<NormalizedTransaction[]> = fc
  .record({
    kind: fc.constantFrom<"intro" | "inferred" | "free-trial">("intro", "inferred", "free-trial"),
    key: fc.constantFrom("netflix", "spotify"),
    currency: fc.constantFrom(...CURRENCIES),
    full: fc.integer({ min: 100, max: 5000 }),
    seed: fc.nat(10_000),
    months: fc.integer({ min: 3, max: 6 }),
  })
  .map(({ kind, key, currency, full, seed, months }) => {
    const options = { currency };
    if (kind === "intro") {
      // The intro 100 then 1499 shape: 2 × intro < full.
      const intro = 1 + (seed % Math.floor((full - 1) / 2));
      const dates = monthlyDates("2026-01-10", months);
      return dates.map((date, i) => charge(date, i === 0 ? intro : full, key, options));
    }
    if (kind === "inferred") {
      // 750 then 1499 with an unrelated transaction 35+ days earlier: startedInStatement.
      const p0 = Math.ceil(full / 2) + (seed % (Math.floor(full / 10) + 1));
      const dates = monthlyDates("2026-01-10", months);
      return [
        charge("2025-12-01", 999, "merchant:unrelated", options),
        ...dates.map((date, i) => charge(date, i === 0 ? p0 : full, key, options)),
      ];
    }
    // A zero row one period before the first charge: freeTrialDate.
    const dates = monthlyDates("2026-02-10", months);
    return [
      zero("2026-01-10", key, options),
      ...dates.map((date) => charge(date, full, key, options)),
    ];
  });

const detectorRowsArb: fc.Arbitrary<NormalizedTransaction[]> = fc.oneof(
  monthlySeriesArb().map((series) => series.transactions),
  weeklySeriesArb.map((series) => series.transactions),
  yearlyPairArb.map((series) => series.transactions),
  fc.array(validTxArb, { maxLength: 30 }),
  handMadeRowsArb,
);

/** Source (a) of Req 11.1: `detectSubscriptions(…).subscriptions` over the detector's arbitraries. */
export const detectorOutputArb: fc.Arbitrary<Subscription[]> = detectorRowsArb
  .chain((rows) =>
    fc
      .oneof(fc.constant([] as NormalizedTransaction[]), unrelatedChargesArb(rows))
      .map((extra) => [...rows, ...extra]),
  )
  .map((rows) => detectSubscriptions(rows).subscriptions);

// --- Answers -----------------------------------------------------------------------------------

/**
 * A `Map` of 0 to 10 entries whose keys mix input ids, random strings, numbers and `null` and
 * whose values mix the two Usage answers with other values; with low probability a value that
 * is not a `Map`. The type is `unknown` on purpose: the classifier must accept values that its
 * signature forbids (Req 1.10), so tests cast the value at the call.
 */
export function answersArb(ids: readonly string[]): fc.Arbitrary<unknown> {
  const idKeyArb: fc.Arbitrary<unknown> = ids.length > 0 ? fc.constantFrom(...ids) : fc.string();
  const keyArb: fc.Arbitrary<unknown> = fc.oneof(
    { weight: 6, arbitrary: idKeyArb },
    { weight: 2, arbitrary: fc.string({ maxLength: 12 }) },
    { weight: 1, arbitrary: fc.integer() },
    { weight: 1, arbitrary: fc.constant(null) },
  );
  const valueArb: fc.Arbitrary<unknown> = fc.oneof(
    { weight: 4, arbitrary: fc.constant("not-using") },
    { weight: 3, arbitrary: fc.constant("still-using") },
    { weight: 1, arbitrary: fc.constantFrom<unknown>("maybe", null, 1, undefined) },
  );
  const mapArb: fc.Arbitrary<unknown> = fc
    .array(fc.tuple(keyArb, valueArb), { maxLength: 10 })
    .map((entries) => new Map<unknown, unknown>(entries));
  // A fresh object per draw, so a test may replace `get` with a spy.
  const notMapArb: fc.Arbitrary<unknown> = fc.oneof(
    fc.constantFrom<unknown>(undefined, null),
    fc.constant(null).map(() => ({})),
    fc.constant(null).map(() => []),
    fc.constant(null).map(() => ({ get: (): unknown => "not-using" })),
  );
  return fc.oneof({ weight: 12, arbitrary: mapArb }, { weight: 1, arbitrary: notMapArb });
}
