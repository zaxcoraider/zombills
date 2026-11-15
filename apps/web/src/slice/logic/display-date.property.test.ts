import fc from "fast-check";
import { describe, it } from "vitest";
import { formatDisplayDate } from "./display-date";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SHAPE = /^([1-9]|[12]\d|3[01]) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/;

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysIn(year: number, month: number): number {
  if (month === 2) return isLeap(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

// Built from integers, never from a Date, so the machine's time zone cannot matter.
const dateArb = fc
  .tuple(
    fc.integer({ min: 1900, max: 2100 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 31 }),
  )
  .map(([y, m, d]) => ({ y, m, d: Math.min(d, daysIn(y, m)) }));

describe("display-date properties", () => {
  it("P11: dates format as 'd Mon yyyy' and map back through the month table", () => {
    fc.assert(
      fc.property(dateArb, ({ y, m, d }) => {
        const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const out = formatDisplayDate(iso);
        if (!SHAPE.test(out)) return false;
        const [day, mon, year] = out.split(" ");
        return Number(day) === d && MONTHS.indexOf(mon ?? "") === m - 1 && Number(year) === y;
      }),
    );
  });
});
