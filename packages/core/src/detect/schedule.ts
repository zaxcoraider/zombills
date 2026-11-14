// Schedule rules: expected dates, deviation and step classification.
// See .kiro/specs/subscription-detector/design.md ("Schedule rules") and Req 4.2, 4.3, 4.6.

import {
  LATE_MAX_DAYS,
  LATE_MIN_DAYS,
  MAX_K,
  MIN_GAP_DAYS,
  TOLERANCE_DAYS,
  addPeriods,
} from "./cadence-rules.js";
import { addMonths, daysInMonth, isLastDayOfMonth } from "./dates.js";
import type { CivilDate } from "./internal-types.js";
import type { Cadence } from "./types.js";

/** Day number of the last day of the month that holds `date`. */
function lastDayOfMonthOf(date: CivilDate): number {
  return date.day + (daysInMonth(date.y, date.m) - date.d);
}

/** How many leading entries of `expectedDays` come from the previous charge (the rest are anchor dates). */
function forwardCount(prev: CivilDate, cadence: Cadence): number {
  return cadence === "monthly" && isLastDayOfMonth(prev) ? 2 : 1;
}

/**
 * Expected Day numbers of the charge `k` periods after `prev`. The entries from the previous
 * charge come first (for monthly with `prev` on the last day of its month, the month-end
 * alternative is the second entry), then the entries from the anchor, which is the first
 * Regular charge of the chain. `anchorIndex` is the period index of `prev` (Req 4.2, 4.3).
 */
export function expectedDays(
  prev: CivilDate,
  anchor: CivilDate,
  anchorIndex: number,
  cadence: Cadence,
  k: 1 | 2,
): number[] {
  const days: number[] = [addPeriods(prev, cadence, k).day];
  if (forwardCount(prev, cadence) === 2) {
    days.push(lastDayOfMonthOf(addMonths(prev, k)));
  }
  days.push(addPeriods(anchor, cadence, anchorIndex + k).day);
  if (cadence === "monthly" && isLastDayOfMonth(anchor)) {
    days.push(lastDayOfMonthOf(addMonths(anchor, anchorIndex + k)));
  }
  return days;
}

/**
 * Smallest distance in days between `candidate` and an expected date, or between `prev` and the
 * date `k` periods before `candidate` (backward check). Anchor dates count only when the
 * candidate is at least `MIN_GAP_DAYS` after `prev` (Req 4.3).
 */
export function deviation(
  prev: CivilDate,
  candidate: CivilDate,
  expected: readonly number[],
  cadence: Cadence,
  k: 1 | 2,
): number {
  const anchorStart = forwardCount(prev, cadence);
  const anchorAllowed = candidate.day - prev.day >= MIN_GAP_DAYS[cadence];
  let best = Math.abs(prev.day - addPeriods(candidate, cadence, -k).day);
  for (let i = 0; i < expected.length; i++) {
    if (i >= anchorStart && !anchorAllowed) break;
    const distance = Math.abs(candidate.day - (expected[i] as number));
    if (distance < best) best = distance;
  }
  return best;
}

/** How a candidate relates to the schedule after `prev`; `null` means it does not fit. */
export interface StepClassification {
  /** Deviation when on schedule with `k = 1` */
  k1: number | null;
  /** Deviation when on schedule with `k = 2` (never for yearly) */
  k2: number | null;
  /** Days late after `addMonths(prev, 1)` (monthly only, 4 to 10; Req 4.6) */
  late: number | null;
}

export function classifyStep(
  prev: CivilDate,
  candidate: CivilDate,
  anchor: CivilDate,
  anchorIndex: number,
  cadence: Cadence,
): StepClassification {
  const tolerance = TOLERANCE_DAYS[cadence];
  const onSchedule = (k: 1 | 2): number | null => {
    if (k > MAX_K[cadence]) return null;
    const expected = expectedDays(prev, anchor, anchorIndex, cadence, k);
    const dev = deviation(prev, candidate, expected, cadence, k);
    return dev <= tolerance ? dev : null;
  };
  let late: number | null = null;
  if (cadence === "monthly") {
    const days = candidate.day - addMonths(prev, 1).day;
    if (days >= LATE_MIN_DAYS.monthly && days <= LATE_MAX_DAYS.monthly) late = days;
  }
  return { k1: onSchedule(1), k2: onSchedule(2), late };
}
