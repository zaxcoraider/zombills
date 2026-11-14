// Cadence constants and period arithmetic.
// See .kiro/specs/subscription-detector/design.md ("Cadence constants").

import { addMonths, fromDayNumber } from "./dates.js";
import type { CivilDate } from "./internal-types.js";
import type { Cadence } from "./types.js";

/** Days a charge may drift from its expected date (Req 4.3). */
export const TOLERANCE_DAYS: Readonly<Record<Cadence, number>> = Object.freeze({
  weekly: 2,
  monthly: 3,
  yearly: 7,
});

/** Largest `k` (periods skipped plus one) a step may span (Req 4.3). */
export const MAX_K: Readonly<Record<Cadence, number>> = Object.freeze({
  weekly: 2,
  monthly: 2,
  yearly: 1,
});

/** Shortest gap for which the anchor date counts (Req 4.3). */
export const MIN_GAP_DAYS: Readonly<Record<Cadence, number>> = Object.freeze({
  weekly: 5,
  monthly: 25,
  yearly: 358,
});

/** Start of the successor window, in days after the keyed charge. */
export const WINDOW_FROM_DAYS: Readonly<Record<Cadence, number>> = Object.freeze({
  weekly: 5,
  monthly: 25,
  yearly: 358,
});

/** End of the successor window, in days after the keyed charge. */
export const WINDOW_TO_DAYS: Readonly<Record<Cadence, number>> = Object.freeze({
  weekly: 16,
  monthly: 65,
  yearly: 373,
});

/** `WINDOW_DAYS` (from / to) as one table. */
export const WINDOW_DAYS: Readonly<Record<"from" | "to", Readonly<Record<Cadence, number>>>> =
  Object.freeze({ from: WINDOW_FROM_DAYS, to: WINDOW_TO_DAYS });

/** Earliest lateness of a late charge; weekly and yearly have none (Req 4.6). */
export const LATE_MIN_DAYS: Readonly<Record<Cadence, number>> = Object.freeze({
  weekly: 0,
  monthly: 4,
  yearly: 0,
});

/** Latest lateness of a late charge; weekly and yearly have none (Req 4.6). */
export const LATE_MAX_DAYS: Readonly<Record<Cadence, number>> = Object.freeze({
  weekly: 0,
  monthly: 10,
  yearly: 0,
});

/** Days past the next expected date before a Subscription counts as ended (Req 7.5). */
export const ENDED_GRACE_DAYS: Readonly<Record<Cadence, number>> = Object.freeze({
  weekly: 2,
  monthly: 10,
  yearly: 7,
});

/** The date `k` periods after `date` (any integer `k`). */
export function addPeriods(date: CivilDate, cadence: Cadence, k: number): CivilDate {
  if (cadence === "weekly") return fromDayNumber(date.day + 7 * k);
  return addMonths(date, cadence === "monthly" ? k : 12 * k);
}
