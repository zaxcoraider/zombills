// Shared fast-check generators and formatters for the parser's tests.
// Test support only: excluded from the build by tsconfig.build.json (`**/test-*.ts`).

import fc from "fast-check";
import Papa from "papaparse";
import {
  AMOUNT_HEADERS,
  CREDIT_HEADERS,
  CURRENCY_HEADERS,
  DATE_HEADERS,
  DEBIT_HEADERS,
  DESCRIPTION_HEADERS,
  normalizeHeader,
} from "./header-names.js";
import type { CurrencyInfo, DateFormat, ParseOptions, Transaction } from "./types.js";

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

const CURRENCY_SYMBOLS: readonly string[] = ["", "", "$", "£", "€", "¥"];
const PADDINGS = ["", "", " ", "\t", "\u00a0", "\u2003", "\n"] as const;

/** A random but valid way of writing an amount, for decorated round-trip tests. */
export function amountFormatArbitrary(
  decimal: "." | ",",
  allowTab = true,
  symbols: readonly string[] = CURRENCY_SYMBOLS,
): fc.Arbitrary<AmountFormat> {
  return fc.record({
    decimal: fc.constant(decimal),
    grouped: fc.boolean(),
    symbol: fc.constantFrom(...symbols),
    symbolAfter: fc.boolean(),
    negativeStyle: fc.constantFrom<NegativeStyle>("leading", "trailing", "parentheses", "inside"),
    padding: fc.constantFrom(...PADDINGS.filter((padding) => allowTab || padding !== "\t")),
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

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

const ALL_RECOGNISED_HEADERS = new Set<string>([
  ...DATE_HEADERS,
  ...DESCRIPTION_HEADERS,
  ...AMOUNT_HEADERS,
  ...DEBIT_HEADERS,
  ...CREDIT_HEADERS,
  ...CURRENCY_HEADERS,
]);

/**
 * A recognised header name written with random upper/lower case and random whitespace around it
 * (Req 2.10). `names` are the lower-case spellings from the recognition lists.
 */
export function headerSpellingArbitrary(
  names: readonly string[],
  allowTab = true,
): fc.Arbitrary<string> {
  const paddings = ["", "", " ", "  ", "\t", "\u00a0", " \t "];
  const padding = fc.constantFrom(...paddings.filter((text) => allowTab || !text.includes("\t")));
  return fc
    .tuple(fc.constantFrom(...names), fc.integer({ min: 0, max: 2 ** 30 - 1 }), padding, padding)
    .map(([name, mask, before, after]) => {
      const cased = [...name]
        .map((character, index) =>
          (mask >> index) & 1 ? character.toUpperCase() : character.toLowerCase(),
        )
        .join("");
      return `${before}${cased}${after}`;
    });
}

/** A header cell that is not on any recognition list, after trimming and lower-casing. */
export const unrecognisedHeaderCellArbitrary: fc.Arbitrary<string> = fc
  .oneof(
    fc.string({ maxLength: 16 }),
    fc.constantFrom(
      "",
      "Account Name",
      "IBAN",
      "Statement Period",
      "Opening Balance",
      "Statement date: 01/05/2026",
      "Date posted",
      "Dates",
      "Amounts",
      "Reference",
      "Balance",
      "Category",
    ),
  )
  .filter((cell) => !ALL_RECOGNISED_HEADERS.has(normalizeHeader(cell)));

// ---------------------------------------------------------------------------
// Statement model (the oracle for the end-to-end properties)
//
// A StatementModel holds the data a statement was *meant* to contain: transactions with a
// direction, the layout and the formats it is written in, header spellings, preamble rows, blank
// rows, delimiter, byte order mark and so on. `renderStatement` writes it out as CSV text and
// `expectedFromModel` says what the parser must return for it. Properties compare the parser
// against the model, never against the parser's own internals.
// ---------------------------------------------------------------------------

export type StatementLayout = "signed-amount" | "debit-credit";
export type Direction = "out" | "in";
export type ModelDelimiter = "," | ";" | "\t";

/**
 * How the sign convention reaches the parser:
 * - `majority`: auto-detected, and the rows are arranged so that most amounts are money out.
 * - `explicit`: passed as `options.signConvention`, any mix of directions.
 * - `any`: auto-detected with any mix of directions, so detection may disagree with the model.
 */
export type SignMode = "majority" | "explicit" | "any";

/** One thing wrong with a row, so that the parser must report it as a row error. */
export type RowDefect =
  "date" | "description" | "currency" | "amount-garbage" | "amount-both" | "amount-neither";

export type BlankKind = "empty" | "delimiters" | "spaces";
export type ModelRole = "date" | "description" | "amount" | "debit" | "credit" | "currency";

export type ColumnSpec =
  { kind: "role"; role: ModelRole } | { kind: "noise"; header: string; noiseIndex: number };

export interface ModelRow {
  date: CalendarDate;
  writing: DateWriting;
  /** As written in the file: may have whitespace around it, always has a non-blank character */
  description: string;
  /** Magnitude in cents, 0 allowed */
  cents: number;
  direction: Direction;
  amountFormat: AmountFormat;
  /** Debit/credit layout: write the populated cell with a minus sign */
  negativeSpelling: boolean;
  /** Debit/credit layout: the cell that is not populated (empty, whitespace or a literal zero) */
  otherCell: string;
  /** Debit/credit layout: how a zero amount is written */
  zeroText: string;
  /** The row's cell in the currency column: "" or a valid code in any case, maybe padded */
  currencyCell: string;
  /** Cells of the noise columns */
  noise: string[];
  /** Drop the trailing noise cells of this row, as short rows in real exports do */
  ragged: boolean;
  defect: RowDefect | null;
  defectIndex: number;
}

export interface StatementModel {
  layout: StatementLayout;
  decimal: "." | ",";
  dateFormat: DateFormat;
  /** The convention the file's amounts are written in (signed layout) */
  signConvention: "positive-out" | "negative-out";
  signMode: SignMode;
  /** `options.currency` as passed, in any case, or null */
  optionCurrency: string | null;
  hasCurrencyColumn: boolean;
  delimiter: ModelDelimiter;
  newline: "\n" | "\r\n";
  bom: boolean;
  /** Header cell text for each role the layout uses, as written */
  headers: Partial<Record<ModelRole, string>>;
  columns: ColumnSpec[];
  preamble: string[][];
  rows: ModelRow[];
  /** Blank rows inserted before each data row; the last entry holds trailing blank rows */
  blanksBefore: BlankKind[][];
  /** True when no free text in the model contains a delimiter character */
  delimiterFreeText: boolean;
  /** Which currency symbols the amount cells carry */
  symbolStyle: SymbolStyle;
}

const DATE_DEFECTS = [
  "",
  "  ",
  "n/a",
  "31/02/2026",
  "99/99/2026",
  "2026-13-45",
  "yesterday",
  "13/13/13",
  "00-00-0000",
];
const DESCRIPTION_DEFECTS = ["", "   ", "\t", "\u00a0"];
const DESCRIPTION_DEFECTS_WITHOUT_TAB = ["", "   ", "\u00a0"];
const CURRENCY_DEFECTS = ["US", "EURO", "12A", "U$D", "dollars"];
const SIGNED_AMOUNT_GARBAGE = ["abc", "", "--5", "1 234.56", "(5", "$$5", "n/a", "12abc"];
// An empty or blank cell is left out here: next to a zero cell it would be a valid 0 amount.
const DEBIT_CREDIT_GARBAGE = ["abc", "--5", "1 234.56", "(5", "$$5", "n/a", "12abc"];

function defectText(row: ModelRow, texts: readonly string[]): string {
  return texts[row.defectIndex % texts.length] ?? "";
}

/** Ways to write a zero amount; the ones with a symbol only use symbols the statement already uses. */
function zeroLiterals(decimal: "." | ",", symbols: readonly string[]): string[] {
  const d = decimal;
  return [
    `0${d}00`,
    `-0${d}00`,
    `(0${d}00)`,
    "0",
    `0${d}0`,
    ...symbols.filter((symbol) => symbol !== "").map((symbol) => `${symbol}0${d}00`),
  ];
}

function nonPopulatedCells(
  decimal: "." | ",",
  allowTab: boolean,
  symbols: readonly string[],
): string[] {
  return ["", "", "   ", ...(allowTab ? ["\t"] : []), "\u00a0", ...zeroLiterals(decimal, symbols)];
}

/** Which currency symbols the amount cells of a statement may carry. */
export type SymbolStyle = "none" | "pound" | "euro" | "dollar" | "yen" | "mixed";

const SYMBOLS_OF_STYLE: Record<SymbolStyle, readonly string[]> = {
  none: [""],
  pound: ["", "£"],
  euro: ["", "€"],
  dollar: ["", "$"],
  yen: ["", "¥"],
  mixed: CURRENCY_SYMBOLS,
};

const BASE_TEXT_CHARACTERS = [
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  " ",
  "-",
  "#",
  "*",
  ".",
  "/",
  "'",
  '"',
  "(",
  ")",
  "&",
  "@",
  ":",
  "_",
  "+",
  "é",
  "ñ",
  "日",
];

function textCharacters(delimiter: ModelDelimiter, delimiterInText: boolean): string[] {
  return delimiterInText ? [...BASE_TEXT_CHARACTERS, delimiter] : BASE_TEXT_CHARACTERS;
}

const NON_BLANK_CHARACTERS = BASE_TEXT_CHARACTERS.filter((character) => character !== " ");

/** Free text with at least one non-blank character, never exactly a recognised header name. */
function textArbitrary(characters: readonly string[], maxLength = 14): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.constantFrom(...NON_BLANK_CHARACTERS),
      fc.string({ unit: fc.constantFrom(...characters), maxLength }),
    )
    .map(([first, rest]) => `${first}${rest}`)
    .filter((text) => !ALL_RECOGNISED_HEADERS.has(normalizeHeader(text)));
}

function descriptionArbitrary(characters: readonly string[]): fc.Arbitrary<string> {
  const padding = fc.constantFrom("", "", "", " ", "  ");
  const oneLine = textArbitrary(characters, 24);
  return fc
    .tuple(
      padding,
      fc.oneof(
        { weight: 9, arbitrary: oneLine },
        { weight: 1, arbitrary: fc.tuple(oneLine, oneLine).map(([a, b]) => `${a}\n${b}`) },
      ),
      padding,
    )
    .map(([before, text, after]) => `${before}${text}${after}`);
}

/** Three ASCII letters in any mix of case. */
export const currencyCodeArbitrary: fc.Arbitrary<string> = fc
  .tuple(
    ...Array.from({ length: 3 }, () =>
      fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"),
    ),
  )
  .map((letters) => letters.join(""));

function currencyCellArbitrary(allowTab: boolean): fc.Arbitrary<string> {
  return fc.oneof(
    { weight: 1, arbitrary: fc.constant("") },
    {
      weight: 3,
      arbitrary: fc
        .tuple(
          fc.constantFrom(...(allowTab ? ["", " ", "\t"] : ["", " "])),
          currencyCodeArbitrary,
          fc.constantFrom("", " "),
        )
        .map(([before, code, after]) => `${before}${code}${after}`),
    },
  );
}

/** Magnitudes in cents: mostly everyday amounts, sometimes huge, sometimes zero. */
const magnitudeArbitrary: fc.Arbitrary<number> = fc.oneof(
  { weight: 8, arbitrary: fc.integer({ min: 1, max: 2_000_000 }) },
  { weight: 1, arbitrary: fc.integer({ min: 1, max: AMOUNT_RANGE_CENTS }) },
  { weight: 1, arbitrary: fc.constant(0) },
);

interface RowContext {
  layout: StatementLayout;
  decimal: "." | ",";
  hasCurrencyColumn: boolean;
  noiseCount: number;
  characters: readonly string[];
  defects: boolean;
  /** Tab characters in padding and blank cells; off for files that are not tab-separated */
  allowTab: boolean;
  symbols: readonly string[];
}

function modelRowArbitrary(context: RowContext): fc.Arbitrary<ModelRow> {
  const possibleDefects: RowDefect[] = [
    "date",
    "description",
    "amount-garbage",
    ...(context.hasCurrencyColumn ? (["currency"] as const) : []),
    ...(context.layout === "debit-credit" ? (["amount-both", "amount-neither"] as const) : []),
  ];
  return fc
    .record({
      date: calendarDate(fc.integer({ min: 2000, max: 2099 })),
      writing: fc.record({
        padDay: fc.boolean(),
        padMonth: fc.boolean(),
        twoDigitYear: fc.boolean(),
      }),
      description: descriptionArbitrary(context.characters),
      cents: magnitudeArbitrary,
      direction: fc.constantFrom<Direction>("out", "in"),
      amountFormat: amountFormatArbitrary(context.decimal, context.allowTab, context.symbols),
      negativeSpelling: fc.boolean(),
      otherCell: fc.constantFrom(
        ...nonPopulatedCells(context.decimal, context.allowTab, context.symbols),
      ),
      zeroText: fc.constantFrom(...zeroLiterals(context.decimal, context.symbols)),
      currencyCell: context.hasCurrencyColumn
        ? currencyCellArbitrary(context.allowTab)
        : fc.constant(""),
      noise: fc.array(textArbitrary(context.characters), {
        minLength: context.noiseCount,
        maxLength: context.noiseCount,
      }),
      ragged: fc.boolean(),
      defect: context.defects
        ? fc.oneof(
            { weight: 6, arbitrary: fc.constant<RowDefect | null>(null) },
            { weight: 1, arbitrary: fc.constantFrom<RowDefect | null>(...possibleDefects) },
          )
        : fc.constant<RowDefect | null>(null),
      defectIndex: fc.nat(),
    })
    .map((row) =>
      // A zero amount next to another populated cell is not a "both populated" row.
      row.defect === "amount-both" && row.cents === 0
        ? { ...row, defect: "amount-garbage" as const }
        : row,
    );
}

export interface StatementModelOptions {
  layout?: StatementLayout;
  /** Let some rows carry a defect. Default true. */
  defects?: boolean;
  /** Let free text contain the file's own delimiter (it gets quoted). Default true. */
  delimiterInText?: boolean;
  /** Default: a random choice between `majority` and `explicit`. */
  signMode?: SignMode;
  maxRows?: number;
  /** Never put a tab character anywhere, so the same text can be re-rendered tab-separated. Default false. */
  noTabs?: boolean;
  /** Fewest data rows. Default 0. */
  minRows?: number;
  /** Fix the date format instead of choosing one. */
  dateFormat?: DateFormat;
  /** Fix whether `options.currency` is passed: "set" always, "none" never. Default: either. */
  currencyOption?: "set" | "none";
  /** Fix whether the statement has a currency column. Default: either. */
  currencyColumn?: boolean;
  /** Fix the currency symbols in the amount cells. Default: any style. */
  symbolStyle?: SymbolStyle;
  /**
   * For dd/mm/yyyy and mm/dd/yyyy: make the last row the only one with a day above 12, so the
   * format cannot be settled from the early rows (Req 3.1).
   */
  deciderAtEnd?: boolean;
}

const ROLE_NAMES: Record<ModelRole, readonly string[]> = {
  date: DATE_HEADERS,
  description: DESCRIPTION_HEADERS,
  amount: AMOUNT_HEADERS,
  debit: DEBIT_HEADERS,
  credit: CREDIT_HEADERS,
  currency: CURRENCY_HEADERS,
};

/** Rows with a strict majority of money out, among the amounts the parser will be able to read. */
function arrangeMajorityOut(rows: ModelRow[]): ModelRow[] {
  const result = rows.map((row) => ({ ...row }));
  const counted = result.filter((row) => row.cents > 0 && row.defect !== "amount-garbage");
  let out = counted.filter((row) => row.direction === "out").length;
  let into = counted.length - out;
  for (const row of counted) {
    if (out > into) {
      break;
    }
    if (row.direction === "in") {
      row.direction = "out";
      out += 1;
      into -= 1;
    }
  }
  return result;
}

export function statementModelArbitrary(
  options: StatementModelOptions = {},
): fc.Arbitrary<StatementModel> {
  const defects = options.defects ?? true;
  const delimiterInText = options.delimiterInText ?? true;
  const maxRows = options.maxRows ?? 14;
  const noTabs = options.noTabs ?? false;
  return fc
    .record({
      layout: options.layout
        ? fc.constant(options.layout)
        : fc.constantFrom<StatementLayout>("signed-amount", "debit-credit"),
      decimal: decimalSeparatorArbitrary,
      dateFormat: options.dateFormat
        ? fc.constant(options.dateFormat)
        : fc.constantFrom(...ALL_DATE_FORMATS),
      signConvention: fc.constantFrom<"positive-out" | "negative-out">(
        "positive-out",
        "negative-out",
      ),
      signMode: options.signMode
        ? fc.constant(options.signMode)
        : fc.constantFrom<SignMode>("majority", "explicit"),
      optionCurrency:
        options.currencyOption === "set"
          ? currencyCodeArbitrary
          : options.currencyOption === "none"
            ? fc.constant<string | null>(null)
            : fc.oneof(fc.constant<string | null>(null), currencyCodeArbitrary),
      hasCurrencyColumn:
        options.currencyColumn === undefined ? fc.boolean() : fc.constant(options.currencyColumn),
      symbolStyle: options.symbolStyle
        ? fc.constant(options.symbolStyle)
        : fc.constantFrom<SymbolStyle>("none", "pound", "euro", "dollar", "yen", "mixed"),
      delimiter: fc.constantFrom<ModelDelimiter>(",", ";", "\t"),
      newline: fc.constantFrom<"\n" | "\r\n">("\n", "\r\n"),
      bom: fc.boolean(),
      unrecognisedNoise: fc.nat({ max: 3 }),
      loneExtra: fc.constantFrom<"none" | "debit" | "credit" | "amount">(
        "none",
        "debit",
        "credit",
        "amount",
      ),
      duplicates: fc.array(fc.nat(), { maxLength: 2 }),
    })
    .chain((context) => {
      const characters = textCharacters(context.delimiter, delimiterInText);
      const rolesOfLayout: ModelRole[] =
        context.layout === "debit-credit"
          ? ["date", "description", "debit", "credit"]
          : ["date", "description", "amount"];
      if (context.hasCurrencyColumn) {
        rolesOfLayout.push("currency");
      }
      // Columns that carry a recognised header name but must be ignored: a stray amount next to
      // debit and credit, a lone debit or credit next to an amount, and later duplicates of real
      // columns (for the other roles the leftmost one wins; for the description the earliest-listed
      // name wins, see `descriptionByListOrder`). They sit at the right end of the header.
      const recognisedNoiseRoles: ModelRole[] = [];
      if (context.layout === "debit-credit" && context.loneExtra === "amount") {
        recognisedNoiseRoles.push("amount");
      }
      if (
        context.layout === "signed-amount" &&
        (context.loneExtra === "debit" || context.loneExtra === "credit")
      ) {
        recognisedNoiseRoles.push(context.loneExtra);
      }
      for (const choice of context.duplicates) {
        recognisedNoiseRoles.push(rolesOfLayout[choice % rolesOfLayout.length] ?? "date");
      }
      const noiseCount = context.unrecognisedNoise + recognisedNoiseRoles.length;
      const rowContext: RowContext = {
        layout: context.layout,
        decimal: context.decimal,
        hasCurrencyColumn: context.hasCurrencyColumn,
        noiseCount,
        characters,
        defects,
        allowTab: context.delimiter === "\t" && !noTabs,
        symbols: SYMBOLS_OF_STYLE[context.symbolStyle],
      };
      const headerSpellings = fc.tuple(
        ...rolesOfLayout.map((role) =>
          headerSpellingArbitrary(ROLE_NAMES[role], rowContext.allowTab),
        ),
      );
      const recognisedNoiseHeaders = fc.tuple(
        ...recognisedNoiseRoles.map((role) =>
          headerSpellingArbitrary(ROLE_NAMES[role], rowContext.allowTab),
        ),
      );
      const unrecognisedNoiseHeaders = fc.array(textArbitrary(characters, 10), {
        minLength: context.unrecognisedNoise,
        maxLength: context.unrecognisedNoise,
      });
      const preambleRow: fc.Arbitrary<string[]> = fc.oneof(
        { weight: 1, arbitrary: fc.constantFrom<string[]>([""], ["", ""], ["  "]) },
        {
          weight: 3,
          arbitrary: fc.array(textArbitrary(characters, 20), { minLength: 1, maxLength: 4 }),
        },
      );
      return fc
        .tuple(
          headerSpellings,
          recognisedNoiseHeaders,
          unrecognisedNoiseHeaders,
          fc.array(preambleRow, { maxLength: 6 }),
          fc.array(modelRowArbitrary(rowContext), {
            minLength: options.minRows ?? 0,
            maxLength: Math.max(maxRows, options.minRows ?? 0),
          }),
          fc.nat(),
        )
        .chain(
          ([
            spellings,
            recognisedHeaders,
            unrecognisedHeaders,
            preamble,
            rawRows,
            deciderChoice,
          ]) => {
            const headers: Partial<Record<ModelRole, string>> = {};
            rolesOfLayout.forEach((role, index) => {
              headers[role] = spellings[index] ?? "";
            });
            const trailingHeaders = [...recognisedHeaders];
            descriptionByListOrder(headers, trailingHeaders, recognisedNoiseRoles);
            const slots: ColumnSpec[] = [
              ...rolesOfLayout.map((role): ColumnSpec => ({ kind: "role", role })),
              ...unrecognisedHeaders.map((header, index): ColumnSpec => ({
                kind: "noise",
                header,
                noiseIndex: index,
              })),
            ];
            const trailing: ColumnSpec[] = trailingHeaders.map((header, index): ColumnSpec => ({
              kind: "noise",
              header,
              noiseIndex: context.unrecognisedNoise + index,
            }));
            return fc
              .shuffledSubarray(slots, { minLength: slots.length, maxLength: slots.length })
              .map((ordered): StatementModel => {
                let rows = rawRows;
                // A dd/mm or mm/dd statement needs one date with a day above 12 to be unambiguous.
                if (
                  rows.length > 0 &&
                  (context.dateFormat === "dd/mm/yyyy" || context.dateFormat === "mm/dd/yyyy")
                ) {
                  const at = options.deciderAtEnd ? rows.length - 1 : deciderChoice % rows.length;
                  rows = rows.map((row, index) => {
                    if (index === at) {
                      return {
                        ...row,
                        defect: null,
                        date: { ...row.date, day: 13 + (row.date.day % 16) },
                      };
                    }
                    // With a late decider every other row stays ambiguous: day 12 or less.
                    return options.deciderAtEnd
                      ? { ...row, date: { ...row.date, day: ((row.date.day - 1) % 12) + 1 } }
                      : row;
                  });
                }
                if (context.layout === "signed-amount" && context.signMode === "majority") {
                  rows = arrangeMajorityOut(rows);
                }
                return {
                  layout: context.layout,
                  decimal: context.decimal,
                  dateFormat: context.dateFormat,
                  signConvention: context.signConvention,
                  signMode: context.signMode,
                  optionCurrency: context.optionCurrency,
                  hasCurrencyColumn: context.hasCurrencyColumn,
                  delimiter: context.delimiter,
                  newline: context.newline,
                  bom: context.bom,
                  headers,
                  columns: [...ordered, ...trailing],
                  preamble,
                  rows,
                  blanksBefore: Array.from({ length: rows.length + 1 }, () => []),
                  delimiterFreeText: !delimiterInText,
                  symbolStyle: context.symbolStyle,
                };
              });
          },
        );
    });
}

/**
 * The parser takes the description from the header whose name comes earliest in
 * `DESCRIPTION_HEADERS`, leftmost among equal names (Req 11.7). The model's description data sits in
 * the real description column, which is left of every trailing duplicate. So when a duplicate has
 * an earlier-listed name than the real column, the two spellings trade places: the real column then
 * holds the winning name and still wins any tie by position.
 */
function descriptionByListOrder(
  headers: Partial<Record<ModelRole, string>>,
  trailingHeaders: string[],
  trailingRoles: readonly ModelRole[],
): void {
  const rank = (cell: string): number => DESCRIPTION_HEADERS.indexOf(normalizeHeader(cell));
  trailingRoles.forEach((role, index) => {
    const duplicate = trailingHeaders[index];
    const real = headers.description;
    if (role === "description" && duplicate !== undefined && real !== undefined) {
      if (rank(duplicate) < rank(real)) {
        headers.description = duplicate;
        trailingHeaders[index] = real;
      }
    }
  });
}

/** Adds blank rows to a model: `kinds[i]` goes before data row i, the last entry after the final row. */
export function withBlankRows(model: StatementModel, kinds: BlankKind[][]): StatementModel {
  return { ...model, blanksBefore: kinds };
}

export function withDelimiter(model: StatementModel, delimiter: ModelDelimiter): StatementModel {
  return { ...model, delimiter };
}

export function withBom(model: StatementModel, bom: boolean): StatementModel {
  return { ...model, bom };
}

export function withPreamble(model: StatementModel, preamble: string[][]): StatementModel {
  return { ...model, preamble };
}

/** Writes every amount with the opposite sign, which is the same statement under the other convention. */
export function withFlippedSignConvention(model: StatementModel): StatementModel {
  return {
    ...model,
    signConvention: model.signConvention === "positive-out" ? "negative-out" : "positive-out",
  };
}

/** Every header written in plain lower case without padding. */
export function withCanonicalHeaders(model: StatementModel): StatementModel {
  const canonical = (text: string): string => text.trim().toLowerCase();
  const headers: Partial<Record<ModelRole, string>> = {};
  for (const [role, text] of Object.entries(model.headers) as Array<[ModelRole, string]>) {
    headers[role] = canonical(text);
  }
  return {
    ...model,
    headers,
    columns: model.columns.map((column) =>
      column.kind === "noise" ? { ...column, header: canonical(column.header) } : column,
    ),
  };
}

/** The amount as written in a signed-amount file under `convention` (0 for a zero amount). */
export function rawSignedCents(row: ModelRow, convention: "positive-out" | "negative-out"): number {
  if (row.cents === 0) {
    return 0;
  }
  return (row.direction === "out") === (convention === "positive-out") ? row.cents : -row.cents;
}

function populatedText(row: ModelRow): string {
  return formatAmount(row.negativeSpelling ? -row.cents : row.cents, row.amountFormat);
}

function debitCreditCells(row: ModelRow): { debit: string; credit: string } {
  let primary: string;
  let other = row.otherCell;
  switch (row.defect) {
    case "amount-garbage":
      primary = defectText(row, DEBIT_CREDIT_GARBAGE);
      break;
    case "amount-neither":
      primary = "";
      other = "  ";
      break;
    case "amount-both":
      primary = populatedText(row);
      other = formatAmount(7, row.amountFormat);
      break;
    default:
      primary = row.cents === 0 ? row.zeroText : populatedText(row);
  }
  return row.direction === "out"
    ? { debit: primary, credit: other }
    : { debit: other, credit: primary };
}

function dataRowCells(model: StatementModel, row: ModelRow): string[] {
  const cells = model.columns.map((column): string => {
    if (column.kind === "noise") {
      return row.noise[column.noiseIndex] ?? "";
    }
    switch (column.role) {
      case "date":
        return row.defect === "date"
          ? defectText(row, DATE_DEFECTS)
          : formatDate(row.date, model.dateFormat, row.writing);
      case "description":
        return row.defect === "description"
          ? defectText(
              row,
              model.delimiter === "\t" ? DESCRIPTION_DEFECTS : DESCRIPTION_DEFECTS_WITHOUT_TAB,
            )
          : row.description;
      case "amount":
        return row.defect === "amount-garbage"
          ? defectText(row, SIGNED_AMOUNT_GARBAGE)
          : formatAmount(rawSignedCents(row, model.signConvention), row.amountFormat);
      case "debit":
        return debitCreditCells(row).debit;
      case "credit":
        return debitCreditCells(row).credit;
      case "currency":
        return row.defect === "currency" ? defectText(row, CURRENCY_DEFECTS) : row.currencyCell;
    }
  });
  if (row.ragged) {
    while (cells.length > 0 && model.columns[cells.length - 1]?.kind === "noise") {
      cells.pop();
    }
  }
  return cells;
}

function blankRowCells(kind: BlankKind, width: number): string[] {
  switch (kind) {
    case "empty":
      return [""];
    case "delimiters":
      return Array.from({ length: width }, () => "");
    case "spaces":
      return Array.from({ length: width }, () => "  ");
  }
}

/** The cells the model intends every row of the file to have, preamble and blank rows included. */
export function statementMatrix(model: StatementModel): string[][] {
  const header = model.columns.map((column) =>
    column.kind === "noise" ? column.header : (model.headers[column.role] ?? ""),
  );
  const matrix: string[][] = [...model.preamble.map((row) => [...row]), header];
  for (let index = 0; index <= model.rows.length; index += 1) {
    for (const kind of model.blanksBefore[index] ?? []) {
      matrix.push(blankRowCells(kind, model.columns.length));
    }
    const row = model.rows[index];
    if (row !== undefined) {
      matrix.push(dataRowCells(model, row));
    }
  }
  return matrix;
}

/** The model as CSV text. */
export function renderStatement(model: StatementModel): string {
  const text = Papa.unparse(statementMatrix(model), {
    delimiter: model.delimiter,
    newline: model.newline,
  });
  return model.bom ? `\uFEFF${text}` : text;
}

/** The options a caller passes for this model. */
export function parseOptionsOf(model: StatementModel): ParseOptions {
  const options: ParseOptions = {};
  if (model.optionCurrency !== null) {
    options.currency = model.optionCurrency;
  }
  if (model.signMode === "explicit") {
    options.signConvention = model.signConvention;
  }
  return options;
}

export interface ModelExpectation {
  transactions: Transaction[];
  /** 1-based ordinals of the rows that must become row errors */
  rowErrorOrdinals: number[];
  /** Number of data rows (blank rows are not data rows) */
  dataRowCount: number;
}

/**
 * The currency symbols in the amount cells that the parser can read as amounts. Cells that are
 * deliberately malformed, or blank, are left out, because they are not shaped like amounts.
 */
export function statementAmountSymbols(model: StatementModel): Set<string> {
  const symbols = new Set<string>();
  const addFrom = (text: string): void => {
    for (const match of text.matchAll(/\p{Sc}/gu)) {
      symbols.add(match[0]);
    }
  };
  for (const row of model.rows) {
    if (model.layout === "signed-amount") {
      if (row.defect !== "amount-garbage") {
        addFrom(formatAmount(rawSignedCents(row, model.signConvention), row.amountFormat));
      }
      continue;
    }
    const { debit, credit } = debitCreditCells(row);
    if (row.defect === "amount-neither") {
      continue;
    }
    // A garbage cell is the populated one; the other cell is still an amount or a blank.
    const garbage =
      row.defect === "amount-garbage" ? (row.direction === "out" ? "debit" : "credit") : null;
    if (garbage !== "debit") {
      addFrom(debit);
    }
    if (garbage !== "credit") {
      addFrom(credit);
    }
  }
  return symbols;
}

/** The `detectedCurrency` the parser must report for the model (Req 10.7-10.9). */
export function statementCurrencyOf(model: StatementModel): CurrencyInfo {
  if (model.optionCurrency !== null) {
    return { code: model.optionCurrency.toUpperCase(), source: "option" };
  }
  if (model.hasCurrencyColumn) {
    const codes = new Set<string>();
    for (const row of model.rows) {
      const cell = row.defect === "currency" ? defectText(row, CURRENCY_DEFECTS) : row.currencyCell;
      if (/^[A-Za-z]{3}$/.test(cell.trim())) {
        codes.add(cell.trim().toUpperCase());
      }
    }
    const [only] = codes;
    return { code: codes.size === 1 && only !== undefined ? only : "USD", source: "column" };
  }
  const symbols = statementAmountSymbols(model);
  const [only] = symbols;
  if (symbols.size === 1 && only === "£") {
    return { code: "GBP", source: "symbol" };
  }
  if (symbols.size === 1 && only === "€") {
    return { code: "EUR", source: "symbol" };
  }
  return { code: "USD", source: "default" };
}

/**
 * What the parser must return for the model. For the signed layout the stored sign depends on
 * the convention the parser used, which defaults to the model's own.
 */
export function expectedFromModel(
  model: StatementModel,
  convention: "positive-out" | "negative-out" = model.signConvention,
): ModelExpectation {
  const fallback = statementCurrencyOf(model).code;
  const transactions: Transaction[] = [];
  const rowErrorOrdinals: number[] = [];
  model.rows.forEach((row, index) => {
    if (row.defect !== null) {
      rowErrorOrdinals.push(index + 1);
      return;
    }
    let amountCents: number;
    if (model.layout === "signed-amount") {
      const raw = rawSignedCents(row, model.signConvention);
      amountCents = raw === 0 ? 0 : convention === "positive-out" ? raw : -raw;
    } else {
      amountCents = row.cents === 0 ? 0 : row.direction === "out" ? row.cents : -row.cents;
    }
    const currencyCell = row.currencyCell.trim();
    transactions.push({
      date: toIso(row.date),
      description: row.description.trim(),
      amountCents,
      currency:
        model.hasCurrencyColumn && currencyCell !== "" ? currencyCell.toUpperCase() : fallback,
    });
  });
  return { transactions, rowErrorOrdinals, dataRowCount: model.rows.length };
}
