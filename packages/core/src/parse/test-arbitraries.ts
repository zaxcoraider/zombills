// Shared fast-check generators and formatters for the parser's tests.
// Test support only: excluded from the build by tsconfig.build.json (`**/test-*.ts`).

import fc from "fast-check";

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
