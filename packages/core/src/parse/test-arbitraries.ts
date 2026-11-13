// Shared fast-check generators and formatters for the parser's tests.
// Test support only: excluded from the build by tsconfig.build.json (`**/test-*.ts`).

import fc from "fast-check";
import type { DateFormat } from "./types";

/**
 * The largest amount in cents the parser accepts (Req 5.11, written 999_999_9900 there).
 * Kept separate from the constant in amount.ts so a drift in either one fails a test.
 */
export const AMOUNT_RANGE_CENTS = 9_999_999_900;

/** Any integer cent value in the supported range (Req 5.13, 13.3, 13.4). */
export const centsArbitrary: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: -AMOUNT_RANGE_CENTS, max: AMOUNT_RANGE_CENTS }),
  fc.constantFrom(0, 1, -1, 9, 10, 99, 100, 101, 99_999, AMOUNT_RANGE_CENTS, -AMOUNT_RANGE_CENTS),
);

export const decimalSeparatorArbitrary: fc.Arbitrary<"." | ","> = fc.constantFrom(".", ",");

/** Inserts `separator` between groups of three digits, counting from the right. */
export function groupThousands(digits: string, separator: string): string {
  let grouped = "";
  for (let i = 0; i < digits.length; i += 1) {
    const remaining = digits.length - i;
    if (i > 0 && remaining % 3 === 0) {
      grouped += separator;
    }
    grouped += digits.charAt(i);
  }
  return grouped;
}

export type NegativeStyle = "leading" | "trailing" | "parentheses" | "inside";

export interface AmountFormat {
  /** Decimal separator written between major and minor units */
  decimal: "." | ",";
  /** Insert thousands separators in the major units */
  grouped: boolean;
  /** Currency symbol, or "" for none */
  symbol: string;
  /** Put the symbol after the number instead of before it */
  symbolAfter: boolean;
  /** How a negative value is written */
  negativeStyle: NegativeStyle;
  /** Whitespace written around the whole cell */
  padding: string;
}

export const PLAIN_US: AmountFormat = {
  decimal: ".",
  grouped: false,
  symbol: "",
  symbolAfter: false,
  negativeStyle: "leading",
  padding: "",
};

/**
 * Renders integer cents as an amount cell using integer arithmetic only, so no floating-point
 * error can enter a round-trip test.
 */
export function formatAmount(cents: number, format: AmountFormat): string {
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const major = Math.floor(absolute / 100);
  const minor = absolute % 100;
  const majorText = format.grouped
    ? groupThousands(String(major), format.decimal === "." ? "," : ".")
    : String(major);
  const number = `${majorText}${format.decimal}${String(minor).padStart(2, "0")}`;
  const withSymbol =
    format.symbol === ""
      ? number
      : format.symbolAfter
        ? `${number}${format.symbol}`
        : `${format.symbol}${number}`;

  let text = withSymbol;
  if (negative) {
    switch (format.negativeStyle) {
      case "leading":
        text = `-${withSymbol}`;
        break;
      case "trailing":
        text = `${withSymbol}-`;
        break;
      case "parentheses":
        text = `(${withSymbol})`;
        break;
      case "inside":
        // "$-5.00": only possible when the symbol comes first; otherwise fall back to a leading minus.
        text =
          format.symbol !== "" && !format.symbolAfter
            ? `${format.symbol}-${number}`
            : `-${withSymbol}`;
        break;
    }
  }
  return `${format.padding}${text}${format.padding}`;
}

/** US style: `1234.56`, `-9.99`. Same text as `(cents / 100).toFixed(2)`. */
export function formatUs(cents: number): string {
  return formatAmount(cents, PLAIN_US);
}

/** European style: `1.234,56` with thousands separators, `1234,56` without. */
export function formatEu(cents: number, withThousands: boolean): string {
  return formatAmount(cents, { ...PLAIN_US, decimal: ",", grouped: withThousands });
}

const CURRENCY_SYMBOLS = ["", "", "$", "£", "€", "¥"] as const;
const PADDINGS = ["", "", " ", "\t", "\u00a0", "\u2003", "\n"] as const;

/** A random but valid way of writing an amount, for decorated round-trip tests. */
export function amountFormatArbitrary(decimal: "." | ","): fc.Arbitrary<AmountFormat> {
  return fc.record({
    decimal: fc.constant(decimal),
    grouped: fc.boolean(),
    symbol: fc.constantFrom(...CURRENCY_SYMBOLS),
    symbolAfter: fc.boolean(),
    negativeStyle: fc.constantFrom<NegativeStyle>("leading", "trailing", "parentheses", "inside"),
    padding: fc.constantFrom(...PADDINGS),
  });
}

const HOSTILE_CHARACTERS = [
  ..."0123456789",
  ..."0123456789",
  ".",
  ",",
  "-",
  "(",
  ")",
  "$",
  "£",
  "€",
  "¥",
  "¢",
  "+",
  "e",
  "E",
  " ",
  "\t",
  "\n",
  "\r",
  "\u00a0",
  "\u202f",
  "\u2028",
  "\u2029",
  "\u200b",
  "\ufeff",
  "\u0663",
  "\u2212",
];

/**
 * Strings the amount parser may be asked to handle: arbitrary text, text built from the
 * characters that matter to it, and valid amounts with one random character change.
 */
export const anyAmountStringArbitrary: fc.Arbitrary<string> = fc.oneof(
  fc.string({ maxLength: 40 }),
  fc.string({ unit: "binary", maxLength: 20 }),
  fc.string({ unit: fc.constantFrom(...HOSTILE_CHARACTERS), maxLength: 24 }),
  fc
    .tuple(
      centsArbitrary,
      decimalSeparatorArbitrary.chain(amountFormatArbitrary),
      fc.nat({ max: 20 }),
      fc.constantFrom(...HOSTILE_CHARACTERS),
    )
    .map(([cents, format, position, character]) => {
      const text = formatAmount(cents, format);
      const at = position % (text.length + 1);
      return `${text.slice(0, at)}${character}${text.slice(at)}`;
    }),
);

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

/**
 * Days in a month according to the JavaScript engine's calendar, used as an oracle that is
 * independent of the parser's own leap-year rule. `month` is 1-12.
 */
export function referenceDaysInMonth(year: number, month: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month, 0); // day 0 of the next month = last day of this month
  return date.getUTCDate();
}

/** The ISO `yyyy-mm-dd` text of a date, built from integers. */
export function toIso(date: CalendarDate): string {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function calendarDate(yearArbitrary: fc.Arbitrary<number>): fc.Arbitrary<CalendarDate> {
  return fc
    .tuple(yearArbitrary, fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 31 }))
    .map(([year, month, rawDay]) => ({
      year,
      month,
      day: ((rawDay - 1) % referenceDaysInMonth(year, month)) + 1,
    }));
}

/** Any valid date from year 1 to 9999, biased towards years around 2000-2099 and leap days. */
export const validDateArbitrary: fc.Arbitrary<CalendarDate> = fc.oneof(
  calendarDate(fc.integer({ min: 1, max: 9999 })),
  calendarDate(fc.integer({ min: 2000, max: 2099 })),
  fc.constantFrom<CalendarDate>(
    { year: 2024, month: 2, day: 29 },
    { year: 2000, month: 2, day: 29 },
    { year: 1900, month: 2, day: 28 },
    { year: 1, month: 1, day: 1 },
    { year: 9999, month: 12, day: 31 },
  ),
);

/** A valid date with a year that two digits can express (2000-2099). */
export const twoDigitYearDateArbitrary: fc.Arbitrary<CalendarDate> = calendarDate(
  fc.integer({ min: 2000, max: 2099 }),
);

export interface DateWriting {
  padDay: boolean;
  padMonth: boolean;
  /** Write the year as two digits (only allowed for years 2000-2099, and never for yyyy-mm-dd) */
  twoDigitYear: boolean;
}

export const ALL_DATE_FORMATS: readonly DateFormat[] = [
  "yyyy-mm-dd",
  "dd/mm/yyyy",
  "mm/dd/yyyy",
  "dd.mm.yyyy",
  "dd-mm-yyyy",
];

/** Writes a date in `format`, with or without zero padding and with a four- or two-digit year. */
export function formatDate(date: CalendarDate, format: DateFormat, writing: DateWriting): string {
  const day = writing.padDay ? String(date.day).padStart(2, "0") : String(date.day);
  const month = writing.padMonth ? String(date.month).padStart(2, "0") : String(date.month);
  if (format === "yyyy-mm-dd") {
    return `${String(date.year).padStart(4, "0")}-${month}-${day}`;
  }
  const year = writing.twoDigitYear
    ? String(date.year - 2000).padStart(2, "0")
    : String(date.year).padStart(4, "0");
  switch (format) {
    case "dd/mm/yyyy":
      return `${day}/${month}/${year}`;
    case "mm/dd/yyyy":
      return `${month}/${day}/${year}`;
    case "dd.mm.yyyy":
      return `${day}.${month}.${year}`;
    case "dd-mm-yyyy":
      return `${day}-${month}-${year}`;
  }
}

/** A date, a format, and a way of writing the date in that format that the parser must read back. */
export const dateWritingCaseArbitrary: fc.Arbitrary<{
  date: CalendarDate;
  format: DateFormat;
  writing: DateWriting;
}> = fc.oneof(
  fc.record({
    date: validDateArbitrary,
    format: fc.constantFrom(...ALL_DATE_FORMATS),
    writing: fc.record({
      padDay: fc.boolean(),
      padMonth: fc.boolean(),
      twoDigitYear: fc.constant(false),
    }),
  }),
  fc.record({
    date: twoDigitYearDateArbitrary,
    format: fc.constantFrom(...ALL_DATE_FORMATS),
    writing: fc.record({
      padDay: fc.boolean(),
      padMonth: fc.boolean(),
      twoDigitYear: fc.constant(true),
    }),
  }),
);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** A list of items together with a random permutation of the same items. */
export function withPermutation<T>(
  item: fc.Arbitrary<T>,
  length: { minLength?: number; maxLength?: number } = {},
): fc.Arbitrary<[T[], T[]]> {
  return fc
    .array(item, { maxLength: 40, ...length })
    .chain((items) =>
      fc.tuple(
        fc.constant(items),
        fc.shuffledSubarray(items, { minLength: items.length, maxLength: items.length }),
      ),
    );
}

/** What a `/`-separated date cell tells the format detector. */
export type SlashKind = "ambiguous" | "day-first" | "month-first";

/**
 * A `/`-separated date cell of the given kind, with random padding and a four- or two-digit year.
 * Every cell is a real date in the format it points to (days above 12 stay at or below 28).
 */
export function slashCellArbitrary(kind: SlashKind): fc.Arbitrary<string> {
  const small = fc.integer({ min: 1, max: 12 });
  const large = fc.integer({ min: 13, max: 28 });
  const parts: fc.Arbitrary<[number, number]> =
    kind === "ambiguous"
      ? fc.tuple(small, small)
      : kind === "day-first"
        ? fc.tuple(large, small)
        : fc.tuple(small, large);
  return fc
    .tuple(parts, fc.integer({ min: 2000, max: 2099 }), fc.boolean(), fc.boolean(), fc.boolean())
    .map(([[first, second], year, padFirst, padSecond, shortYear]) => {
      const a = padFirst ? String(first).padStart(2, "0") : String(first);
      const b = padSecond ? String(second).padStart(2, "0") : String(second);
      const y = shortYear ? String(year - 2000).padStart(2, "0") : String(year);
      return `${a}/${b}/${y}`;
    });
}
