// Test-only generators for the subscription detector (design "Generators"). Not part of the
// build: tsconfig.build.json excludes `test-*.ts`.
//
// The merchant pools are small on purpose: random rows then share keys and amounts often enough
// for the properties to reach the grouping, Series and refund code, not only the validation.

import fc from "fast-check";
import { KNOWN_SERVICES } from "../normalize/known-services.js";
import type {
  MerchantIdentity,
  MerchantSource,
  NormalizedTransaction,
  ProcessorId,
} from "../normalize/types.js";
import { addMonths, daysInMonth, formatDate, fromDayNumber, parseIsoDate } from "./dates.js";
import type { CivilDate } from "./internal-types.js";
import { validateElement } from "./validate.js";

/** The Known services the generators draw from (real ids, so Req 2.1 agreement holds). */
const KNOWN_POOL: readonly { serviceId: string; displayName: string }[] = KNOWN_SERVICES.slice(
  0,
  4,
).map((service) => ({ serviceId: service.serviceId, displayName: service.displayName }));

const GENERIC_SLUGS: readonly string[] = ["gym", "coffee", "bakery", "fuel"];
const UNIDENTIFIED_RESIDUES: readonly string[] = ["acme 123", "shop 77", "bill 555"];
const PROCESSORS: readonly ProcessorId[] = ["paypal", "apple", "google"];
const CURRENCIES: readonly string[] = ["USD", "EUR", "GBP"];

function isoDateOf(year: number, month: number, dayOfMonth: number): string {
  const day = Math.min(dayOfMonth, daysInMonth(year, month));
  return formatDate(year, month, day);
}

/** Real dates from 2020-01-01 to 2030-12-31, plus a rare branch over years 0000–9999. */
export const isoDateArb: fc.Arbitrary<string> = fc.oneof(
  {
    weight: 19,
    arbitrary: fc
      .tuple(fc.integer({ min: 2020, max: 2030 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 31 }))
      .map(([y, m, d]) => isoDateOf(y, m, d)),
  },
  {
    weight: 1,
    arbitrary: fc
      .tuple(fc.integer({ min: 0, max: 9999 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 31 }))
      .map(([y, m, d]) => isoDateOf(y, m, d)),
  },
);

/** A `MerchantIdentity` that passes Req 2.1 for the given source. */
export function merchantArb(source: MerchantSource): fc.Arbitrary<MerchantIdentity> {
  const processorArb = fc.option(fc.constantFrom(...PROCESSORS), { nil: null });
  if (source === "known") {
    return fc
      .tuple(fc.constantFrom(...KNOWN_POOL), processorArb)
      .map(([service, processor]) => ({
        key: service.serviceId,
        displayName: service.displayName,
        source: "known" as const,
        serviceId: service.serviceId,
        processor,
      }));
  }
  if (source === "generic") {
    return fc.tuple(fc.constantFrom(...GENERIC_SLUGS), processorArb).map(([slug, processor]) => ({
      key: `merchant:${slug}`,
      displayName: slug,
      source: "generic" as const,
      serviceId: null,
      processor,
    }));
  }
  return fc
    .tuple(fc.option(fc.constantFrom(...PROCESSORS), { nil: null }), fc.constantFrom(...UNIDENTIFIED_RESIDUES))
    .map(([processor, residue]) => ({
      key: `unidentified:${processor ?? "none"}:${residue}`,
      displayName: residue,
      source: "unidentified" as const,
      serviceId: null,
      processor,
    }));
}

const anyMerchantArb: fc.Arbitrary<MerchantIdentity> = fc.oneof(
  merchantArb("known"),
  merchantArb("generic"),
  merchantArb("unidentified"),
);

/** Amounts are −10⁶ to 10⁶ (zero included); a few round values make equal amounts common. */
const amountArb: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: -1_000_000, max: 1_000_000 }),
  fc.constantFrom(0, 999, 1049, 1549, -999),
);

/** A valid `NormalizedTransaction`. */
export const validTxArb: fc.Arbitrary<NormalizedTransaction> = fc.record({
  date: isoDateArb,
  description: fc.string({ maxLength: 30 }),
  amountCents: amountArb,
  currency: fc.constantFrom(...CURRENCIES),
  merchant: anyMerchantArb,
});

/** A valid-looking transaction with exactly one thing wrong. */
const brokenTxArb: fc.Arbitrary<unknown> = fc.oneof(
  validTxArb.map((tx) => ({ ...tx, date: "2026-02-30" })),
  validTxArb.map((tx) => ({ ...tx, date: 20260101 })),
  validTxArb.map((tx) => ({ ...tx, currency: "usd" })),
  validTxArb.map((tx) => ({ ...tx, description: 42 })),
  validTxArb.map((tx) => ({ ...tx, amountCents: 1.5 })),
  validTxArb.map((tx) => ({ ...tx, amountCents: "999" })),
  validTxArb.map((tx) => ({ ...tx, merchant: null })),
  validTxArb.map((tx) => ({ ...tx, merchant: { ...tx.merchant, key: "" } })),
  validTxArb.map((tx) => ({ ...tx, merchant: { ...tx.merchant, source: "other" } })),
  validTxArb.map((tx) => ({ ...tx, merchant: { ...tx.merchant, processor: undefined } })),
  // key disagrees with source
  validTxArb.map((tx) => ({
    ...tx,
    merchant: { ...tx.merchant, source: "known" as const, key: "merchant:x", serviceId: "merchant:x" },
  })),
  validTxArb.map((tx) => ({
    ...tx,
    merchant: { ...tx.merchant, source: "generic" as const, key: "gym", serviceId: null },
  })),
  validTxArb.map((tx) => ({
    description: tx.description,
    amountCents: tx.amountCents,
    currency: tx.currency,
    merchant: tx.merchant,
  })),
);

/** Plain-data junk: primitives, arrays, odd objects, and transactions with one broken field. */
export const junkElementArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom<unknown>(null, undefined, true, false, 0, -1, 1.5, Number.NaN, "", "x", [], {}),
  fc.integer(),
  fc.double(),
  fc.string({ maxLength: 20 }),
  fc.array(fc.jsonValue(), { maxLength: 3 }),
  fc.jsonValue().map((value) => ({ value })),
  brokenTxArb,
);

// --- Series generators (design "Generators") -------------------------------------------------

/** A generated run of charges of one merchant, with the numbers that produced it. */
export interface GeneratedSeries {
  /** The charges, oldest first. */
  transactions: NormalizedTransaction[];
  merchant: MerchantIdentity;
  currency: string;
  amountCents: number;
  /** First scheduled date, before any shift. */
  start: string;
  /** Days added to each scheduled date, one per charge. */
  shifts: number[];
}

/** Options of `monthlySeriesArb`. */
export interface MonthlySeriesOptions {
  /** Largest anchor day; the design uses 28, and 31 for P9. Default 28. */
  maxAnchorDay?: number;
  minCharges?: number;
  maxCharges?: number;
  /** Largest shift in days per charge. Default 2. */
  maxShift?: number;
  /** The constant amount. Default 100 to 5000 cents. */
  amountCents?: fc.Arbitrary<number>;
}

const SERIES_SOURCES: readonly ("known" | "generic")[] = ["known", "generic"];

const seriesAmountArb: fc.Arbitrary<number> = fc.integer({ min: 100, max: 5000 });

/** A start date inside 2020–2030 whose day of month is the anchor, clamped to the month. */
function anchoredStartArb(maxAnchorDay: number): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.integer({ min: 2020, max: 2028 }),
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 1, max: maxAnchorDay }),
    )
    .map(([y, m, d]) => isoDateOf(y, m, d));
}

function startOf(iso: string): CivilDate {
  const parsed = parseIsoDate(iso);
  if (parsed === null) throw new Error(`generator produced an invalid date: ${iso}`);
  return parsed;
}

function seriesRows(
  dates: readonly string[],
  merchant: MerchantIdentity,
  currency: string,
  amountCents: number,
): NormalizedTransaction[] {
  return dates.map((date) => ({
    date,
    description: merchant.displayName,
    amountCents,
    currency,
    merchant: { ...merchant },
  }));
}

/**
 * Monthly charges on `addMonths(start, i)` plus a shift of 0 to `maxShift` days each, one
 * constant amount, source "known" or "generic" (Req 11.8, 11.9).
 */
export function monthlySeriesArb(options: MonthlySeriesOptions = {}): fc.Arbitrary<GeneratedSeries> {
  const { maxAnchorDay = 28, minCharges = 4, maxCharges = 24, maxShift = 2 } = options;
  return fc
    .record({
      source: fc.constantFrom(...SERIES_SOURCES),
      start: anchoredStartArb(maxAnchorDay),
      currency: fc.constantFrom(...CURRENCIES),
      amountCents: options.amountCents ?? seriesAmountArb,
      shifts: fc.array(fc.integer({ min: 0, max: maxShift }), { minLength: minCharges, maxLength: maxCharges }),
    })
    .chain(({ source, start, currency, amountCents, shifts }) =>
      merchantArb(source).map((merchant) => {
        const first = startOf(start);
        const dates = shifts.map((shift, i) => fromDayNumber(addMonths(first, i).day + shift).iso);
        return { transactions: seriesRows(dates, merchant, currency, amountCents), merchant, currency, amountCents, start, shifts };
      }),
    );
}

/**
 * Charges of a "known" merchant 7 days apart, each shifted 0 to 2 days, 3 to 52 charges
 * (Req 11.9). Only known merchants can be weekly (Req 5.2).
 */
export const weeklySeriesArb: fc.Arbitrary<GeneratedSeries> = fc
  .record({
    start: isoDateArb2020s(),
    currency: fc.constantFrom(...CURRENCIES),
    amountCents: seriesAmountArb,
    shifts: fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 3, maxLength: 52 }),
  })
  .chain(({ start, currency, amountCents, shifts }) =>
    merchantArb("known").map((merchant) => {
      const first = startOf(start);
      const dates = shifts.map((shift, i) => fromDayNumber(first.day + 7 * i + shift).iso);
      return { transactions: seriesRows(dates, merchant, currency, amountCents), merchant, currency, amountCents, start, shifts };
    }),
  );

/** Real dates in 2020–2028 (the common branch of `isoDateArb`, without the rare wide one). */
function isoDateArb2020s(): fc.Arbitrary<string> {
  return fc
    .tuple(fc.integer({ min: 2020, max: 2028 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 31 }))
    .map(([y, m, d]) => isoDateOf(y, m, d));
}

/** Two charges of a "known" merchant, `b` being `addMonths(a, 12)` plus a shift (Req 11.9). */
export interface GeneratedYearlyPair extends GeneratedSeries {
  a: string;
  b: string;
  /** Days added to `b` only; shifting both could add a day across 29 February (review finding 4). */
  shift: number;
}

/** `a`, and `b = addMonths(a, 12) + s` for `s` from 0 to 7 days; only `b` is shifted. */
export const yearlyPairArb: fc.Arbitrary<GeneratedYearlyPair> = fc
  .record({
    a: isoDateArb2020s(),
    shift: fc.integer({ min: 0, max: 7 }),
    currency: fc.constantFrom(...CURRENCIES),
    amountCents: seriesAmountArb,
  })
  .chain(({ a, shift, currency, amountCents }) =>
    merchantArb("known").map((merchant) => {
      const b = fromDayNumber(addMonths(startOf(a), 12).day + shift).iso;
      return {
        transactions: seriesRows([a, b], merchant, currency, amountCents),
        merchant,
        currency,
        amountCents,
        start: a,
        shifts: [0, shift],
        a,
        b,
        shift,
      };
    }),
  );

// --- Habits and unrelated purchases (design "Generators") -------------------------------------

/** A generated same-price habit: charges of one generic merchant every 7 or 14 days. */
export interface GeneratedHabit extends GeneratedSeries {
  /** Days between scheduled charges: 7 or 14. */
  periodDays: 7 | 14;
  /** Week indices (of the 7-day schedule) left out; always empty for the 14-day habit. */
  skippedWeeks: number[];
}

/**
 * A generic key and one amount, charged every 7 or 14 days over 3 to 26 weeks, each charge
 * shifted 0 to 2 days. The 7-day habit skips random weeks, never two in a row, so no gap
 * between two charges exceeds 16 days (Req 11.10).
 */
export const habitArb: fc.Arbitrary<GeneratedHabit> = fc
  .record({
    periodDays: fc.constantFrom<7 | 14>(7, 14),
    start: isoDateArb2020s(),
    weeks: fc.integer({ min: 3, max: 26 }),
    currency: fc.constantFrom(...CURRENCIES),
    amountCents: seriesAmountArb,
    skipFlags: fc.array(fc.boolean(), { minLength: 26, maxLength: 26 }),
    shiftPool: fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 26, maxLength: 26 }),
  })
  .chain(({ periodDays, start, weeks, currency, amountCents, skipFlags, shiftPool }) =>
    merchantArb("generic").map((merchant) => {
      const first = startOf(start);
      const count = periodDays === 7 ? weeks : Math.floor(weeks / 2) + 1;
      const skippedWeeks: number[] = [];
      if (periodDays === 7) {
        let previousSkipped = false;
        for (let week = 0; week < weeks; week += 1) {
          const skip: boolean = (skipFlags[week] ?? false) && !previousSkipped;
          if (skip) skippedWeeks.push(week);
          previousSkipped = skip;
        }
      }
      const kept: number[] = [];
      for (let i = 0; i < count; i += 1) if (!skippedWeeks.includes(i)) kept.push(i);
      const shifts = kept.map((_, j) => shiftPool[j] ?? 0);
      const dates = kept.map((i, j) => fromDayNumber(first.day + periodDays * i + (shifts[j] ?? 0)).iso);
      return {
        transactions: seriesRows(dates, merchant, currency, amountCents),
        merchant,
        currency,
        amountCents,
        start,
        shifts,
        periodDays,
        skippedWeeks,
      };
    }),
  );

/**
 * Charges with fresh generic keys, a currency of the input and a date from the input's first
 * to its last valid date (Req 11.7). Gives `[]` when the input has no valid transaction. The
 * keys are also distinct from each other, so none of the added charges can recur.
 */
export function unrelatedChargesArb(
  input: readonly unknown[],
): fc.Arbitrary<NormalizedTransaction[]> {
  const keys = new Set<string>();
  const currencies = new Set<string>();
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  input.forEach((element, index) => {
    const checked = validateElement(element, index);
    if (!checked.ok) return;
    keys.add(checked.entry.merchant.key);
    currencies.add(checked.entry.currency);
    low = Math.min(low, checked.entry.date.day);
    high = Math.max(high, checked.entry.date.day);
  });
  if (currencies.size === 0) return fc.constant([]);
  const currencyList = [...currencies].sort();
  return fc
    .array(
      fc.record({
        day: fc.integer({ min: low, max: high }),
        currency: fc.constantFrom(...currencyList),
        amountCents: fc.integer({ min: 1, max: 1_000_000 }),
      }),
      { maxLength: 12 },
    )
    .map((specs) => {
      let counter = 0;
      return specs.map(({ day, currency, amountCents }) => {
        let key = `merchant:unrelated-${counter}`;
        while (keys.has(key)) {
          counter += 1;
          key = `merchant:unrelated-${counter}`;
        }
        counter += 1;
        return {
          date: fromDayNumber(day).iso,
          description: key,
          amountCents,
          currency,
          merchant: {
            key,
            displayName: key.slice("merchant:".length),
            source: "generic" as const,
            serviceId: null,
            processor: null,
          },
        };
      });
    });
}

// --- Drifting late bands (design "Generators", P20) --------------------------------------------

/** Shape of one drifting band: how many chains, how long, and how the late steps behave. */
export interface DriftingLateShape {
  /** Chains started on consecutive days from `start`. */
  chains: number;
  /** Charges per chain. */
  steps: number;
  /** First charge of the first chain; chain `i` starts `i` days later. */
  start: CivilDate;
  /** Days late of the late step of chain `i`, one value per chain (reused cyclically). */
  lateDays: readonly number[];
  /** Per chain, how the schedule continues after a late charge (Req 4.6). */
  continuations: readonly ("from-previous" | "from-late")[];
}

/**
 * The dates of an interleaved drifting band, oldest chain first. Every charge is 3 days after
 * `addMonths` of the previous one, so the anchor windows drift away from the previous-charge
 * windows. Every fourth step is instead `lateDays` late (4 to 10 for a valid late charge). The
 * schedule then continues either from the charge before the late one (`addMonths(prev, 2)`, plus
 * the usual 3 days) or from the late one (`addMonths(late, 1)`, plus the usual 3 days).
 */
export function driftingLateDates(shape: DriftingLateShape): string[] {
  const dates: string[] = [];
  for (let chain = 0; chain < shape.chains; chain += 1) {
    const late = shape.lateDays[chain % shape.lateDays.length] ?? 7;
    const continuation = shape.continuations[chain % shape.continuations.length] ?? "from-late";
    let current = fromDayNumber(shape.start.day + chain);
    const days = [current.iso];
    while (days.length < shape.steps) {
      if (days.length % 4 === 0) {
        const lateCharge = fromDayNumber(addMonths(current, 1).day + late);
        days.push(lateCharge.iso);
        if (continuation === "from-previous") {
          current = fromDayNumber(addMonths(current, 2).day + 3);
          days.push(current.iso);
        } else {
          current = lateCharge;
        }
      } else {
        current = fromDayNumber(addMonths(current, 1).day + 3);
        days.push(current.iso);
      }
    }
    dates.push(...days.slice(0, shape.steps));
  }
  return dates;
}

/** Rows of one merchant and amount on the given dates. */
export function rowsOnDates(
  dates: readonly string[],
  merchant: MerchantIdentity,
  currency: string,
  amountCents: number,
): NormalizedTransaction[] {
  return seriesRows(dates, merchant, currency, amountCents);
}

/** A generated drifting band: one key, one amount, 2 to 10 interleaved chains. */
export interface GeneratedDriftingBand extends GeneratedSeries {
  chains: number;
  steps: number;
}

/**
 * One key and amount; 2 to 10 interleaved monthly chains starting on consecutive days, each
 * charge 3 days after `addMonths` of the previous one, and every fourth step 4 to 10 days late
 * with either continuation of Req 4.6. Used for the comparison counter (P20).
 */
export const driftingLateBandArb: fc.Arbitrary<GeneratedDriftingBand> = fc
  .record({
    source: fc.constantFrom(...SERIES_SOURCES),
    start: isoDateArb2020s(),
    currency: fc.constantFrom(...CURRENCIES),
    amountCents: seriesAmountArb,
    chains: fc.integer({ min: 2, max: 10 }),
    steps: fc.integer({ min: 2, max: 10 }),
    lateDays: fc.array(fc.integer({ min: 4, max: 10 }), { minLength: 10, maxLength: 10 }),
    continuations: fc.array(fc.constantFrom<"from-previous" | "from-late">("from-previous", "from-late"), {
      minLength: 10,
      maxLength: 10,
    }),
  })
  .chain(({ source, start, currency, amountCents, chains, steps, lateDays, continuations }) =>
    merchantArb(source).map((merchant) => {
      const first = startOf(start);
      const dates = driftingLateDates({ chains, steps, start: first, lateDays, continuations });
      return {
        transactions: seriesRows(dates, merchant, currency, amountCents),
        merchant,
        currency,
        amountCents,
        start,
        shifts: dates.map(() => 0),
        chains,
        steps,
      };
    }),
  );
