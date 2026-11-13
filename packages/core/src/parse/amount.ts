import type { AmountOutcome, DecimalSeparator } from "./internal-types";
import { ParseError } from "./parse-error";

/** Largest accepted absolute value in cents: 99,999,999.00 in major units (Req 5.11). */
export const MAX_AMOUNT_CENTS = 9_999_999_900;

/** More integer digits than this can never fit under MAX_AMOUNT_CENTS, so they are rejected first. */
const MAX_INTEGER_DIGITS = 8;

/** Outer whitespace stripped before parsing (Req 5.1): Unicode Zs, Zl, Zp plus tab, newline, carriage return. */
const OUTER_WHITESPACE_CHAR = /[\p{Zs}\p{Zl}\p{Zp}\t\n\r]/u;

/** Any whitespace left inside the cell (Req 5.10). */
const INNER_WHITESPACE = /[\s\p{Z}]/u;

const SYMBOL_THEN_MINUS = /^(\p{Sc})-(.*)$/su;
const UNSIGNED = /^(?:(\p{Sc})([0-9.,]+)|([0-9.,]+)(\p{Sc})|([0-9.,]+))$/u;

const MAX_QUOTED_LENGTH = 40;

function quote(raw: string): string {
  const shown = raw.length > MAX_QUOTED_LENGTH ? `${raw.slice(0, MAX_QUOTED_LENGTH)}…` : raw;
  return JSON.stringify(shown);
}

function fail(raw: string, why: string): never {
  throw new ParseError("amount", `${why}: ${quote(raw)}`);
}

/** Negation that never produces -0, so results stay deeply equal to 0 (design: `-0`). */
export function negate(cents: number): number {
  return cents === 0 ? 0 : -cents;
}

/** Strips outer whitespace (Req 5.1). Done with a loop rather than a regex to stay linear on long runs. */
function trimOuter(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && OUTER_WHITESPACE_CHAR.test(text.charAt(start))) {
    start += 1;
  }
  while (end > start && OUTER_WHITESPACE_CHAR.test(text.charAt(end - 1))) {
    end -= 1;
  }
  return text.slice(start, end);
}

/**
 * Returns the digits of an unsigned amount, with at most one currency symbol removed.
 * Grammar: `SYM NUMBER | NUMBER SYM | NUMBER`, where NUMBER is one or more of `0-9 . ,`.
 */
function unsignedNumber(text: string, raw: string): string {
  const match = UNSIGNED.exec(text);
  if (match === null) {
    return fail(raw, "Unparseable amount");
  }
  return match[2] ?? match[3] ?? match[5] ?? fail(raw, "Unparseable amount");
}

/**
 * Parses one amount cell into integer cents without ever going through floating point.
 *
 * Accepted shapes (after outer whitespace is stripped): `-5`, `5-`, `(5)`, `$5`, `5$`, `-$5`,
 * `$-5`, `($5)` and plain numbers, where the number may use thousands separators.
 *
 * @throws ParseError for anything else. No other error type is thrown for string input.
 */
export function parseAmountCents(raw: string, separator: DecimalSeparator): number {
  // Req 5.1 and 5.9: strip outer whitespace; an empty cell is an error.
  const trimmed = trimOuter(raw);
  if (trimmed === "") {
    return fail(raw, "Empty amount");
  }
  // Req 5.10: whitespace between components is an error.
  if (INNER_WHITESPACE.test(trimmed)) {
    return fail(raw, "Whitespace inside amount");
  }

  // Req 5.2 and 5.3: exactly one sign indicator, at most one currency symbol.
  let negative = false;
  let body = trimmed;
  const symbolThenMinus = SYMBOL_THEN_MINUS.exec(trimmed);
  if (trimmed.startsWith("(")) {
    if (!trimmed.endsWith(")") || trimmed.length < 3) {
      return fail(raw, "Unbalanced parentheses in amount");
    }
    negative = true;
    body = trimmed.slice(1, -1);
  } else if (trimmed.startsWith("-")) {
    negative = true;
    body = trimmed.slice(1);
  } else if (trimmed.endsWith("-")) {
    negative = true;
    body = trimmed.slice(0, -1);
  } else if (symbolThenMinus !== null) {
    negative = true;
    body = `${symbolThenMinus[1] ?? ""}${symbolThenMinus[2] ?? ""}`;
  }
  const number = unsignedNumber(body, raw);

  // Req 5.4 and 5.5: drop thousands separators, then split on the decimal separator.
  const thousands = separator === "." ? "," : ".";
  const withoutThousands = number.split(thousands).join("");
  const parts = withoutThousands.split(separator);
  if (parts.length > 2) {
    return fail(raw, "More than one decimal separator in amount");
  }
  const integerPart = parts[0] ?? "";
  const fractionPart = parts[1] ?? "";
  if (integerPart === "" && fractionPart === "") {
    return fail(raw, "Amount has no digits");
  }

  // Req 5.6 and 5.7: at most two decimal digits; never round or truncate.
  if (fractionPart.length > 2) {
    return fail(raw, "More than 2 decimal digits in amount");
  }

  // Req 5.11: reject oversized values before any numeric conversion.
  const significantInteger = integerPart.replace(/^0+/, "");
  if (significantInteger.length > MAX_INTEGER_DIGITS) {
    return fail(raw, "Amount exceeds the maximum");
  }
  const cents =
    (significantInteger === "" ? 0 : parseInt(significantInteger, 10)) * 100 +
    parseInt(fractionPart.padEnd(2, "0"), 10);
  if (cents > MAX_AMOUNT_CENTS) {
    return fail(raw, "Amount exceeds the maximum");
  }

  return negative ? negate(cents) : cents;
}

/**
 * Like `parseAmountCents`, but returns the failure instead of throwing it. Only `ParseError` is
 * caught: any other error is a bug and propagates.
 */
export function tryParseAmount(raw: string, separator: DecimalSeparator): AmountOutcome {
  try {
    return { ok: true, cents: parseAmountCents(raw, separator) };
  } catch (error) {
    if (error instanceof ParseError) {
      return { ok: false, reason: error.message };
    }
    throw error;
  }
}
