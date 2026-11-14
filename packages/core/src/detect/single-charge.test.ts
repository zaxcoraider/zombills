import { describe, expect, it } from "vitest";
import type { NormalizedTransaction } from "../normalize/types.js";
import { acceptSeries } from "./accept.js";
import { groupCharges } from "./bands.js";
import { compareContent } from "./content-order.js";
import { parseIsoDate } from "./dates.js";
import type { CivilDate, Entry, Group, Series } from "./internal-types.js";
import { matchRefunds } from "./refunds.js";
import { reportSingleKnownCharges } from "./single-charge.js";
import { charge, credit } from "./test-fixtures.js";
import { validateElement } from "./validate.js";

const NETFLIX = "netflix";
const SPOTIFY = "spotify";
const GENERIC = "merchant:gym";
const UNIDENTIFIED = "unidentified:apple:apple.com/bill 866-712-7753 ca";

/** The Groups of `rows`, built the way the detector does, with refunds matched. */
function groupsOf(rows: NormalizedTransaction[]): Group[] {
  const valid: Omit<Entry, "rank">[] = [];
  rows.forEach((row, index) => {
    const result = validateElement(row, index);
    if (!result.ok) throw new Error(result.reason);
    valid.push(result.entry);
  });
  valid.sort(compareContent);
  const entries = valid.map((entry, rank) => ({ ...entry, rank }));
  const { refunded, refunds } = matchRefunds(entries);
  return groupCharges(entries, refunded, refunds);
}

function date(iso: string): CivilDate {
  const parsed = parseIsoDate(iso);
  if (parsed === null) throw new Error(`bad date ${iso}`);
  return parsed;
}

/** A Series of the given charges of `group`, as step 5 would hand it to acceptance. */
function seriesOf(group: Group, indexes: number[]): Series {
  const regular = indexes.map((i) => group.charges[i] as Entry);
  return {
    group,
    cadence: "monthly",
    regular,
    intervals: [],
    bandIds: [0],
    intro: null,
    cadenceAssumed: false,
    confidence: "low",
  };
}

describe("reportSingleKnownCharges (Req 5.4)", () => {
  it("reports one low-confidence one-charge Series with an assumed cadence", () => {
    const groups = groupsOf([charge("2026-01-10", 1549, NETFLIX)]);
    const [single, ...rest] = reportSingleKnownCharges(groups, [], date("2026-01-20"));
    expect(rest).toEqual([]);
    expect(single?.group).toBe(groups[0]);
    expect(single?.regular).toEqual([groups[0]?.charges[0]]);
    expect(single?.intervals).toEqual([]);
    expect(single?.intro).toBeNull();
    expect(single?.confidence).toBe("low");
    expect(single?.cadenceAssumed).toBe(true);
    expect(single?.bandIds).toEqual([0]);
  });

  describe("monthly / yearly boundary at addMonths(charge, 1) + 3", () => {
    const groups = groupsOf([charge("2026-01-10", 1549, NETFLIX)]);

    it("is monthly at exactly addMonths + 3", () => {
      const [single] = reportSingleKnownCharges(groups, [], date("2026-02-13"));
      expect(single?.cadence).toBe("monthly");
    });

    it("is yearly one day later", () => {
      const [single] = reportSingleKnownCharges(groups, [], date("2026-02-14"));
      expect(single?.cadence).toBe("yearly");
    });

    it("is monthly when the As-of date is before the charge", () => {
      const [single] = reportSingleKnownCharges(groups, [], date("2026-01-01"));
      expect(single?.cadence).toBe("monthly");
    });

    it("clamps the month end: a charge on 01-31 is monthly through 03-03 (02-28 + 3)", () => {
      const jan31 = groupsOf([charge("2026-01-31", 1549, NETFLIX)]);
      expect(reportSingleKnownCharges(jan31, [], date("2026-03-03"))[0]?.cadence).toBe("monthly");
      expect(reportSingleKnownCharges(jan31, [], date("2026-03-04"))[0]?.cadence).toBe("yearly");
    });
  });

  it("takes the latest charge of a Group", () => {
    const groups = groupsOf([
      charge("2026-01-10", 1549, NETFLIX),
      charge("2026-03-25", 1549, NETFLIX),
      charge("2026-02-10", 1549, NETFLIX),
    ]);
    const [single] = reportSingleKnownCharges(groups, [], date("2026-04-01"));
    expect(single?.regular).toHaveLength(1);
    expect(single?.regular[0]?.date.iso).toBe("2026-03-25");
  });

  it("on the same date takes the Content-order first: Netflix 1549 and 999 give the 999 charge", () => {
    const groups = groupsOf([
      charge("2026-01-10", 1549, NETFLIX),
      charge("2026-01-10", 999, NETFLIX),
    ]);
    const result = reportSingleKnownCharges(groups, [], date("2026-01-20"));
    expect(result).toHaveLength(1);
    expect(result[0]?.regular[0]?.amountCents).toBe(999);
  });

  it("gives the same charge whatever the input order of equal dates", () => {
    const rows = [charge("2026-01-10", 1549, NETFLIX), charge("2026-01-10", 999, NETFLIX)];
    const forward = reportSingleKnownCharges(groupsOf(rows), [], date("2026-01-20"));
    const backward = reportSingleKnownCharges(groupsOf([...rows].reverse()), [], date("2026-01-20"));
    expect(forward[0]?.regular[0]?.amountCents).toBe(999);
    expect(backward[0]?.regular[0]?.amountCents).toBe(999);
  });

  it("gives nothing for a Group whose only charge is refunded", () => {
    const groups = groupsOf([
      charge("2026-01-10", 1549, NETFLIX),
      credit("2026-01-12", 1549, NETFLIX),
    ]);
    expect(reportSingleKnownCharges(groups, [], date("2026-01-20"))).toEqual([]);
  });

  it("reports the live charge when only another charge of the Group is refunded", () => {
    const groups = groupsOf([
      charge("2026-01-10", 1549, NETFLIX),
      credit("2026-01-12", 1549, NETFLIX),
      charge("2026-02-10", 999, NETFLIX),
    ]);
    const result = reportSingleKnownCharges(groups, [], date("2026-02-20"));
    expect(result).toHaveLength(1);
    expect(result[0]?.regular[0]?.date.iso).toBe("2026-02-10");
  });

  it("gives nothing for a Group with an accepted Series", () => {
    const groups = groupsOf([
      charge("2026-01-10", 1549, NETFLIX),
      charge("2026-02-10", 1549, NETFLIX),
    ]);
    const group = groups[0] as Group;
    const accepted = [seriesOf(group, [0, 1])];
    expect(reportSingleKnownCharges(groups, accepted, date("2026-02-20"))).toEqual([]);
  });

  it("gives nothing for generic and unidentified Groups", () => {
    const groups = groupsOf([
      charge("2026-01-10", 999, GENERIC),
      charge("2026-01-10", 999, UNIDENTIFIED),
    ]);
    expect(groups).toHaveLength(2);
    expect(reportSingleKnownCharges(groups, [], date("2026-01-20"))).toEqual([]);
  });

  it("reports each known Group without an accepted Series, in Group order", () => {
    const groups = groupsOf([
      charge("2026-01-10", 1549, NETFLIX),
      charge("2026-02-10", 1549, NETFLIX),
      charge("2026-01-05", 1099, SPOTIFY),
      charge("2026-01-07", 999, GENERIC),
    ]);
    const netflix = groups.find((g) => g.key === NETFLIX) as Group;
    const result = reportSingleKnownCharges(groups, [seriesOf(netflix, [0, 1])], date("2026-01-20"));
    expect(result).toHaveLength(1);
    expect(result[0]?.group.key).toBe(SPOTIFY);
  });

  it("can report a charge of a Series rejected in step 6 (Req 5.5)", () => {
    // Two on-schedule Netflix charges plus three more at the same amount: m = 5 ≥ 2n − 1 = 3.
    const groups = groupsOf([
      charge("2026-01-05", 1549, NETFLIX),
      charge("2026-01-20", 1549, NETFLIX),
      charge("2026-02-05", 1549, NETFLIX),
      charge("2026-02-20", 1549, NETFLIX),
      charge("2026-03-20", 1549, NETFLIX),
    ]);
    const group = groups[0] as Group;
    const rejected = seriesOf(group, [0, 2]);
    expect(acceptSeries(rejected)).toBeNull();
    const result = reportSingleKnownCharges(groups, [], date("2026-03-25"));
    expect(result).toHaveLength(1);
    expect(result[0]?.regular[0]?.date.iso).toBe("2026-03-20");
    expect(result[0]?.confidence).toBe("low");
  });

  it("returns no Series for no Groups", () => {
    expect(reportSingleKnownCharges([], [], date("2026-01-01"))).toEqual([]);
  });
});
