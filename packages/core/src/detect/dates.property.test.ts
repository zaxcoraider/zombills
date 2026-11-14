import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addMonths, dayNumber, fromDayNumber, parseIsoDate } from "./dates.js";
import type { CivilDate } from "./internal-types.js";

// An independent month-length reference, so the properties do not lean on daysInMonth.
function referenceLength(y: number, m: number): number {
  if (m === 2) return y % 400 === 0 || (y % 4 === 0 && y % 100 !== 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

const ymdArb = fc
  .record({ y: fc.integer({ min: 0, max: 9999 }), m: fc.integer({ min: 1, max: 12 }) })
  .chain(({ y, m }) =>
    fc.integer({ min: 1, max: referenceLength(y, m) }).map((d) => ({ y, m, d })),
  );

function civil(y: number, m: number, d: number): CivilDate {
  const date = parseIsoDate(
    `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
  );
  if (date === null) throw new Error("generated date does not parse");
  return date;
}

describe("dates", () => {
  it("P15: date arithmetic round-trips", () => {
    fc.assert(
      fc.property(ymdArb, ({ y, m, d }) => {
        const back = fromDayNumber(dayNumber(y, m, d));
        expect([back.y, back.m, back.d]).toEqual([y, m, d]);
      }),
    );
  });

  it("P15: consecutive dates differ by 1", () => {
    fc.assert(
      fc.property(ymdArb, ({ y, m, d }) => {
        const [ny, nm, nd] =
          d < referenceLength(y, m) ? [y, m, d + 1] : m < 12 ? [y, m + 1, 1] : [y + 1, 1, 1];
        expect(dayNumber(ny as number, nm as number, nd as number) - dayNumber(y, m, d)).toBe(1);
        expect(fromDayNumber(dayNumber(y, m, d) + 1).iso).toBe(
          `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`,
        );
      }),
    );
  });

  it("P15: addMonths equals a month-by-month reference that clamps the day", () => {
    fc.assert(
      fc.property(
        ymdArb.filter(({ y }) => y >= 100 && y <= 9000),
        fc.integer({ min: -240, max: 240 }),
        ({ y, m, d }, k) => {
          let ry = y;
          let rm = m;
          for (let i = 0; i < Math.abs(k); i += 1) {
            rm += Math.sign(k);
            if (rm === 13) [ry, rm] = [ry + 1, 1];
            if (rm === 0) [ry, rm] = [ry - 1, 12];
          }
          const rd = Math.min(d, referenceLength(ry, rm));
          const result = addMonths(civil(y, m, d), k);
          expect([result.y, result.m, result.d]).toEqual([ry, rm, rd]);
          expect(result.day).toBe(dayNumber(ry, rm, rd));
        },
      ),
    );
  });

  it("P15: known Day numbers", () => {
    expect(dayNumber(1970, 1, 1)).toBe(0);
    expect(dayNumber(2000, 3, 1)).toBe(11017);
  });
});
