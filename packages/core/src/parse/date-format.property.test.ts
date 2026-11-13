import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CalendarDate } from "./test-arbitraries";
import type { DateFormat } from "./types";
import { daysInMonth, detectDateFormat, parseDate } from "./date-format";
import {
  ALL_DATE_FORMATS,
  dateWritingCaseArbitrary,
  formatDate,
  referenceDaysInMonth,
  slashCellArbitrary,
  toIso,
  validDateArbitrary,
  withPermutation,
} from "./test-arbitraries";

describe("date parsing properties", () => {
  it("P5: round-trip, parseDate(formatDate(d, fmt, writing), fmt) is d as yyyy-mm-dd", () => {
    fc.assert(
      fc.property(dateWritingCaseArbitrary, ({ date, format, writing }) => {
        expect(parseDate(formatDate(date, format, writing), format)).toBe(toIso(date));
      }),
      { numRuns: 1000 },
    );
  });

  it("P5: output is always a zero-padded ISO date regardless of the input format", () => {
    fc.assert(
      fc.property(dateWritingCaseArbitrary, ({ date, format, writing }) => {
        expect(parseDate(formatDate(date, format, writing), format)).toMatch(
          /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
        );
      }),
    );
  });

  it("P5: the same date written in every format parses to the same ISO string", () => {
    fc.assert(
      fc.property(validDateArbitrary, fc.boolean(), fc.boolean(), (date, padDay, padMonth) => {
        const writing = { padDay, padMonth, twoDigitYear: false };
        for (const format of ALL_DATE_FORMATS) {
          expect(parseDate(formatDate(date, format, writing), format)).toBe(toIso(date));
        }
      }),
    );
  });

  it("P5: daysInMonth agrees with the JavaScript calendar for every year and month", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9999 }), fc.integer({ min: 1, max: 12 }), (y, m) => {
        expect(daysInMonth(y, m)).toBe(referenceDaysInMonth(y, m));
      }),
      { numRuns: 1000 },
    );
  });

  it("P5: a day one past the end of the month is rejected", () => {
    fc.assert(
      fc.property(validDateArbitrary, (date) => {
        const overflow = { ...date, day: referenceDaysInMonth(date.year, date.month) + 1 };
        const writing = { padDay: true, padMonth: true, twoDigitYear: false };
        for (const format of ALL_DATE_FORMATS) {
          expect(() => parseDate(formatDate(overflow, format, writing), format)).toThrow();
        }
      }),
    );
  });
});

/** Dates written in `format`, with random padding and a four- or two-digit year. */
function datesWrittenIn(
  format: DateFormat,
  dates: fc.Arbitrary<CalendarDate>,
): fc.Arbitrary<string> {
  return fc
    .tuple(dates, fc.boolean(), fc.boolean())
    .map(([date, padDay, padMonth]) =>
      formatDate(date, format, { padDay, padMonth, twoDigitYear: false }),
    );
}

/** Any mix of date shapes, slash kinds, impossible dates and non-dates. */
const anyDateCell: fc.Arbitrary<string> = fc.oneof(
  dateWritingCaseArbitrary.map(({ date, format, writing }) => formatDate(date, format, writing)),
  slashCellArbitrary("ambiguous"),
  slashCellArbitrary("day-first"),
  slashCellArbitrary("month-first"),
  fc.constantFrom("", "  ", "n/a", "13/13/2026", "31/02/2026", "May 1, 2026", "2026/05/01"),
  fc.string({ maxLength: 12 }),
);

/** Dates from 2000-2099 whose day is 12 or less, so a slash date is ambiguous. */
const ambiguousDate: fc.Arbitrary<CalendarDate> = fc.record({
  year: fc.integer({ min: 2000, max: 2099 }),
  month: fc.integer({ min: 1, max: 12 }),
  day: fc.integer({ min: 1, max: 12 }),
});

/** A date from 2000-2099 whose day is above 12 and valid in every month. */
const lateInMonthDate: fc.Arbitrary<CalendarDate> = fc.record({
  year: fc.integer({ min: 2000, max: 2099 }),
  month: fc.integer({ min: 1, max: 12 }),
  day: fc.integer({ min: 13, max: 28 }),
});

describe("date format detection properties", () => {
  it("P11: shuffling the date cells never changes the detection (Req 3.6)", () => {
    fc.assert(
      fc.property(withPermutation(anyDateCell), ([cells, shuffled]) => {
        expect(detectDateFormat(shuffled)).toEqual(detectDateFormat(cells));
      }),
      { numRuns: 500 },
    );
  });

  it("P11: a dd/mm statement is detected even when its only day above 12 is in the last row (Req 3.1, 3.3)", () => {
    fc.assert(
      fc.property(
        fc.array(slashCellArbitrary("ambiguous"), { minLength: 10, maxLength: 60 }),
        slashCellArbitrary("day-first"),
        (ambiguous, deciding) => {
          expect(detectDateFormat([...ambiguous, deciding])).toEqual({
            kind: "detected",
            info: { format: "dd/mm/yyyy", assumed: false },
          });
        },
      ),
    );
  });

  it("P11: a mm/dd statement is detected even when its only day above 12 is in the last row (Req 3.1, 3.4)", () => {
    fc.assert(
      fc.property(
        fc.array(slashCellArbitrary("ambiguous"), { minLength: 10, maxLength: 60 }),
        slashCellArbitrary("month-first"),
        (ambiguous, deciding) => {
          expect(detectDateFormat([...ambiguous, deciding])).toEqual({
            kind: "detected",
            info: { format: "mm/dd/yyyy", assumed: false },
          });
        },
      ),
    );
  });

  it("P11: dates written dd/mm/yyyy with at least one day above 12 are detected as dd/mm/yyyy, in any order", () => {
    fc.assert(
      fc.property(
        withPermutation(datesWrittenIn("dd/mm/yyyy", fc.oneof(ambiguousDate, lateInMonthDate))),
        datesWrittenIn("dd/mm/yyyy", lateInMonthDate),
        ([, cells], deciding) => {
          expect(detectDateFormat([...cells, deciding])).toEqual({
            kind: "detected",
            info: { format: "dd/mm/yyyy", assumed: false },
          });
        },
      ),
    );
  });

  it("P11: dates written mm/dd/yyyy with at least one day above 12 are detected as mm/dd/yyyy, in any order", () => {
    fc.assert(
      fc.property(
        withPermutation(datesWrittenIn("mm/dd/yyyy", fc.oneof(ambiguousDate, lateInMonthDate))),
        datesWrittenIn("mm/dd/yyyy", lateInMonthDate),
        ([, cells], deciding) => {
          expect(detectDateFormat([...cells, deciding])).toEqual({
            kind: "detected",
            info: { format: "mm/dd/yyyy", assumed: false },
          });
        },
      ),
    );
  });

  it("P11: slash dates whose parts are all 12 or less default to mm/dd/yyyy, assumed (Req 3.5)", () => {
    fc.assert(
      fc.property(
        withPermutation(slashCellArbitrary("ambiguous"), { minLength: 1 }),
        ([, cells]) => {
          expect(detectDateFormat(cells)).toEqual({
            kind: "detected",
            info: { format: "mm/dd/yyyy", assumed: true },
          });
        },
      ),
    );
  });

  it("P11: ISO, dot and dash dates settle the format, not assumed (Req 3.2, 3.11)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<DateFormat>("yyyy-mm-dd", "dd.mm.yyyy", "dd-mm-yyyy"),
        fc.array(validDateArbitrary, { minLength: 1, maxLength: 30 }),
        fc.boolean(),
        fc.boolean(),
        (format, dates, padDay, padMonth) => {
          const cells = dates.map((date) =>
            formatDate(date, format, { padDay, padMonth, twoDigitYear: false }),
          );
          expect(detectDateFormat(cells)).toEqual({
            kind: "detected",
            info: { format, assumed: false },
          });
        },
      ),
    );
  });

  it("P12: slash dates with a day-first cell and a month-first cell are a conflict, in any order (Req 3.10)", () => {
    fc.assert(
      fc.property(
        withPermutation(
          fc.oneof(
            slashCellArbitrary("ambiguous"),
            slashCellArbitrary("day-first"),
            slashCellArbitrary("month-first"),
            fc.constantFrom("", "n/a", "13/13/2026", "31/02/2026"),
          ),
        ),
        slashCellArbitrary("day-first"),
        slashCellArbitrary("month-first"),
        ([, cells], dayFirst, monthFirst) => {
          const result = detectDateFormat([...cells, dayFirst, monthFirst]);
          expect(result.kind).toBe("conflict");
          expect(detectDateFormat([monthFirst, ...cells, dayFirst])).toEqual(result);
        },
      ),
    );
  });

  it("P12: without both a day-first and a month-first cell there is no conflict", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(slashCellArbitrary("ambiguous"), slashCellArbitrary("day-first")), {
          maxLength: 30,
        }),
        (cells) => {
          expect(detectDateFormat(cells).kind).not.toBe("conflict");
        },
      ),
    );
  });

  it("P12: cells that contradict the detected slash format fail parseDate and all others parse", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            slashCellArbitrary("ambiguous"),
            slashCellArbitrary("day-first"),
            slashCellArbitrary("month-first"),
          ),
          { minLength: 1, maxLength: 30 },
        ),
        (cells) => {
          const result = detectDateFormat(cells);
          if (result.kind !== "detected") {
            return;
          }
          // Every cell is a real date in the format detection chose, unless it contradicts it.
          const { format } = result.info;
          for (const cell of cells) {
            const [first, second] = cell.split("/").map(Number);
            const contradicts = format === "dd/mm/yyyy" ? (second ?? 0) > 12 : (first ?? 0) > 12;
            if (contradicts) {
              expect(() => parseDate(cell, format)).toThrow();
            } else {
              expect(() => parseDate(cell, format)).not.toThrow();
            }
          }
        },
      ),
    );
  });
});
