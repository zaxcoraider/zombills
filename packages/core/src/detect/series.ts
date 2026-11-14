// Step 5a: joining Segments across Amount bands into Series.
// See .kiro/specs/subscription-detector/design.md ("Joins across bands") and Req 3.5, 3.6, 4.5, 4.6.

import { WINDOW_FROM_DAYS, WINDOW_TO_DAYS } from "./cadence-rules.js";
import type { Entry, Group, Interval, Segment, Series } from "./internal-types.js";
import { classifyStep } from "./schedule.js";
import type { Cadence } from "./types.js";

/** Cadences a one-charge piece with no cadence may take, by Group source (Req 3.10 step 3). */
const KNOWN_CADENCES: readonly Cadence[] = Object.freeze(["weekly", "monthly", "yearly"]);
/** Cadences tried when two one-charge pieces of a `"known"` Group join: monthly, then yearly (Req 3.6). */
const SINGLE_JOIN_CADENCES: readonly Cadence[] = Object.freeze(["monthly", "yearly"]);

/** A Segment with the values the join search reads repeatedly. */
interface Piece {
  segment: Segment;
  first: Entry;
  ones: number;
  twos: number;
}

/** The Series built so far. `cadence` is null while it is still one charge from a one-charge piece. */
interface Building {
  cadence: Cadence | null;
  charges: Entry[];
  intervals: Interval[];
  bandIds: number[];
  lastBandId: number;
  ones: number;
  twos: number;
}

/** A way to append a piece: the cadence taken, the join interval, and the interval out of a late charge. */
interface JoinPlan {
  cadence: Cadence;
  join: Interval;
  /** Replaces the first interval of the piece after a late join (Req 4.6), else `null` */
  firstOut: Interval | null;
}

function makePiece(segment: Segment): Piece {
  let ones = 0;
  let twos = 0;
  for (const interval of segment.intervals) {
    if (interval.k === 1) ones++;
    else twos++;
  }
  return { segment, first: segment.charges[0] as Entry, ones, twos };
}

/** Index of the first piece in `byDay` whose first charge is on Day number `day` or later. */
function firstAtOrAfter(byDay: readonly Piece[], day: number): number {
  let lo = 0;
  let hi = byDay.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((byDay[mid] as Piece).first.date.day < day) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The cadences under which `piece` may be appended to `state`, in the order they are tried. */
function cadencesFor(state: Building, piece: Piece, group: Group): readonly Cadence[] {
  const own = piece.segment.cadence;
  if (state.cadence !== null) {
    if (own === null || own === state.cadence) return [state.cadence];
    return [];
  }
  if (own !== null) return [own];
  return group.source === "known" ? SINGLE_JOIN_CADENCES : [];
}

/**
 * The interval out of the first charge of `piece` after a late join (Req 3.6, 4.6), or `"refuse"`
 * when the second charge of `piece` is neither on schedule after `l` with `k = 2` nor on schedule
 * after the first charge with `k = 1`. Both continuations count as `k = 1`. A one-charge `piece`
 * has no interval out and gives `null`.
 */
function lateOut(piece: Piece, l: Entry): Interval | null | "refuse" {
  const second = piece.segment.charges[1];
  const own = piece.segment.intervals[0];
  if (second === undefined || own === undefined) return null;
  const afterL = classifyStep(l.date, second.date, l.date, 0, "monthly").k2;
  if (afterL !== null) return { k: 1, kind: "on-schedule", deviation: afterL };
  if (own.k === 1 && own.kind === "on-schedule") return own;
  return "refuse";
}

/**
 * How `piece` could follow `state` under `cadence`, or `null` (design "Joins across bands").
 * The anchor rule is not used at a join: `classifyStep(l, g, l, 0, …)` has the previous charge as
 * its own anchor, so only the forward rule, the month-end alternative and the backward check apply.
 */
function planJoin(state: Building, piece: Piece, cadence: Cadence, group: Group): JoinPlan | null {
  const l = state.charges[state.charges.length - 1] as Entry;
  const g = piece.first;
  const p = l.amountCents;
  const q = g.amountCents;
  if (Math.max(p, q) > 2 * Math.min(p, q)) return null;
  if (state.charges.length < 2 && group.source !== "known") return null;

  const bothSingle = state.charges.length === 1 && piece.segment.charges.length === 1;
  const step = classifyStep(l.date, g.date, l.date, 0, cadence);
  const lastInterval = state.intervals[state.intervals.length - 1];
  const afterLate = lastInterval !== undefined && lastInterval.kind === "late";

  let join: Interval | null = null;
  let firstOut: Interval | null = null;
  if (step.k1 !== null) {
    join = { k: 1, kind: "on-schedule", deviation: step.k1 };
  } else if (!bothSingle && !afterLate && step.k2 !== null) {
    join = { k: 2, kind: "on-schedule", deviation: step.k2 };
  } else if (afterLate && !bothSingle) {
    // Req 4.6: after a late charge only two continuations; the one from the charge before it
    // is `k = 2` from that charge and counts as `k = 1`.
    const before = state.charges[state.charges.length - 2] as Entry;
    const fromBefore = classifyStep(before.date, g.date, before.date, 0, cadence).k2;
    if (fromBefore !== null) join = { k: 1, kind: "on-schedule", deviation: fromBefore };
  }
  if (join === null && cadence === "monthly" && !bothSingle && !afterLate && step.late !== null) {
    const out = lateOut(piece, l);
    if (out === "refuse") return null;
    join = { k: 1, kind: "late", deviation: step.late };
    firstOut = out;
  }
  if (join === null) return null;

  // Req 4.4 for the whole joined Series; the join interval counts as its own `k`.
  let ones = state.ones + piece.ones;
  let twos = state.twos + piece.twos;
  if (join.k === 1) ones++;
  else twos++;
  const own = piece.segment.intervals[0];
  if (firstOut !== null && own !== undefined && own.k !== firstOut.k) {
    if (firstOut.k === 1) {
      ones++;
      twos--;
    } else {
      ones--;
      twos++;
    }
  }
  if (ones < 1 || twos > ones) return null;
  return { cadence, join, firstOut };
}

/** Which of two plans' pieces wins: earliest first charge, smaller `|q − p|`, then Content order. */
function beats(a: Piece, b: Piece, p: number): boolean {
  const dayA = a.first.date.day;
  const dayB = b.first.date.day;
  if (dayA !== dayB) return dayA < dayB;
  const gapA = Math.abs(a.first.amountCents - p);
  const gapB = Math.abs(b.first.amountCents - p);
  if (gapA !== gapB) return gapA < gapB;
  return a.first.rank < b.first.rank;
}

/**
 * Joins the Segments of one Group (the chosen Segments of all its bands and their one-charge
 * leftovers) into Series (design "Joins across bands", Req 3.5, 3.6). Pieces are taken in Content
 * order of their first charge; each extends the Series built so far with the best candidate until
 * none is left, and the result is kept when it has 2 or more Regular charges. The returned Series
 * have no Introductory charge, `cadenceAssumed: false` and a placeholder `confidence: "low"` that
 * `acceptSeries` replaces. The input Segments are not changed.
 */
export function joinSegments(group: Group, segments: readonly Segment[]): Series[] {
  const pieces = segments.filter((s) => s.charges.length > 0).map(makePiece);
  pieces.sort((a, b) => a.first.rank - b.first.rank);
  const byDay = [...pieces].sort(
    (a, b) => a.first.date.day - b.first.date.day || a.first.rank - b.first.rank,
  );
  const consumed = new Set<Piece>();
  const allowed: readonly Cadence[] =
    group.source === "known" ? KNOWN_CADENCES : SINGLE_JOIN_CADENCES;
  const result: Series[] = [];

  for (const start of pieces) {
    if (consumed.has(start)) continue;
    if (start.segment.charges.length === 1 && group.source !== "known") continue;
    const state: Building = {
      cadence: start.segment.cadence,
      charges: [...start.segment.charges],
      intervals: start.segment.intervals.map((i) => ({ ...i })),
      bandIds: [start.segment.bandId],
      lastBandId: start.segment.bandId,
      ones: start.ones,
      twos: start.twos,
    };
    const members: Piece[] = [start];
    consumed.add(start);

    for (;;) {
      const l = state.charges[state.charges.length - 1] as Entry;
      const lastInterval = state.intervals[state.intervals.length - 1];
      const cadences = state.cadence === null ? allowed : [state.cadence];
      const found = new Set<Piece>();
      const collect = (lo: number, hi: number): void => {
        for (let i = firstAtOrAfter(byDay, lo); i < byDay.length; i++) {
          const piece = byDay[i] as Piece;
          if (piece.first.date.day > hi) break;
          if (!consumed.has(piece)) found.add(piece);
        }
      };
      for (const cadence of cadences) {
        collect(l.date.day + WINDOW_FROM_DAYS[cadence], l.date.day + WINDOW_TO_DAYS[cadence]);
      }
      if (lastInterval !== undefined && lastInterval.kind === "late") {
        const before = state.charges[state.charges.length - 2] as Entry;
        collect(
          before.date.day + WINDOW_FROM_DAYS.monthly,
          before.date.day + WINDOW_TO_DAYS.monthly,
        );
      }

      let best: { piece: Piece; plan: JoinPlan } | null = null;
      for (const piece of found) {
        if (piece.segment.bandId === state.lastBandId) continue;
        if (piece.first.date.day <= l.date.day) continue;
        for (const cadence of cadencesFor(state, piece, group)) {
          const plan = planJoin(state, piece, cadence, group);
          if (plan === null) continue;
          if (best === null || beats(piece, best.piece, l.amountCents)) best = { piece, plan };
          break;
        }
      }
      if (best === null) break;

      const { piece, plan } = best;
      const out = piece.segment.intervals.map((i) => ({ ...i }));
      if (plan.firstOut !== null && out.length > 0) out[0] = { ...plan.firstOut };
      state.charges.push(...piece.segment.charges);
      state.intervals.push(plan.join, ...out);
      state.cadence = plan.cadence;
      state.ones = 0;
      state.twos = 0;
      for (const interval of state.intervals) {
        if (interval.k === 1) state.ones++;
        else state.twos++;
      }
      state.lastBandId = piece.segment.bandId;
      if (!state.bandIds.includes(piece.segment.bandId)) state.bandIds.push(piece.segment.bandId);
      consumed.add(piece);
      members.push(piece);
    }

    if (state.charges.length >= 2 && state.cadence !== null) {
      result.push({
        group,
        cadence: state.cadence,
        regular: state.charges,
        intervals: state.intervals,
        bandIds: state.bandIds,
        intro: null,
        cadenceAssumed: false,
        confidence: "low",
      });
    } else {
      // The start piece stays a leftover and may not be used by a later Series.
      for (const piece of members) consumed.delete(piece);
    }
  }
  return result;
}

/** Whether `c` is a better Introductory charge than `best`: latest, then lower amount, then Content order. */
function betterIntro(c: Entry, best: Entry): boolean {
  if (c.date.day !== best.date.day) return c.date.day > best.date.day;
  if (c.amountCents !== best.amountCents) return c.amountCents < best.amountCents;
  return c.rank < best.rank;
}

/**
 * Gives each Series of a `"known"` Group its Introductory charge, if any (design "Introductory
 * charges", Req 3.7–3.9). Series are taken in Content order of their first Regular charge `r`.
 * A candidate is a leftover that costs less than `r`, is dated before `r`, and has `r` on
 * schedule after it with `k = 1`. The latest candidate wins, then the lower amount, then Content
 * order. Each leftover is used at most once and each Series gets at most one. Sets `intro` on the
 * Series; adds no interval and does not change `regular`. `leftovers` is not changed.
 */
export function addIntroCharges(group: Group, series: Series[], leftovers: readonly Entry[]): void {
  if (group.source !== "known") return;
  const used = new Set<Entry>();
  const ordered = series
    .filter((s) => s.regular.length >= 2 && s.intro === null)
    .sort((a, b) => (a.regular[0] as Entry).rank - (b.regular[0] as Entry).rank);

  for (const s of ordered) {
    const r = s.regular[0] as Entry;
    let best: Entry | null = null;
    for (const c of leftovers) {
      if (used.has(c)) continue;
      if (c.amountCents >= r.amountCents || c.date.day >= r.date.day) continue;
      if (classifyStep(c.date, r.date, c.date, 0, s.cadence).k1 === null) continue;
      if (best === null || betterIntro(c, best)) best = c;
    }
    if (best !== null) {
      s.intro = best;
      used.add(best);
    }
  }
}
