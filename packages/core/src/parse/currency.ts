import { ParseError } from "./parse-error";

const CURRENCY_CODE = /^[A-Za-z]{3}$/;

const MAX_QUOTED_LENGTH = 40;

/**
 * Whether `value` has the shape of an ISO 4217 alpha-3 code: exactly three ASCII letters in any
 * case (Req 10.1, 10.3). It checks the shape only, not whether the code is assigned.
 */
export function isCurrencyCode(value: string): boolean {
  return CURRENCY_CODE.test(value);
}

/** Upper-cases a currency code, so "usd" becomes "USD". Call it on values that pass `isCurrencyCode`. */
export function normalizeCurrency(value: string): string {
  return value.toUpperCase();
}

/**
 * The currency of one row (Req 10.4-10.6).
 *
 * @param cell the row's cell in the currency column, or undefined when the statement has no such column
 * @param fallback the statement-level currency, already validated and upper-cased
 * @returns the cell's code in upper case; the fallback when there is no column or the cell is empty
 * @throws ParseError("currency") when the cell holds something that is not a currency code
 */
export function resolveRowCurrency(cell: string | undefined, fallback: string): string {
  if (cell === undefined) {
    return fallback;
  }
  const trimmed = cell.trim();
  if (trimmed === "") {
    return fallback;
  }
  if (!isCurrencyCode(trimmed)) {
    const shown =
      trimmed.length > MAX_QUOTED_LENGTH ? `${trimmed.slice(0, MAX_QUOTED_LENGTH)}…` : trimmed;
    throw new ParseError(
      "currency",
      `Invalid currency code ${JSON.stringify(shown)}: expected 3 letters, such as "USD"`,
    );
  }
  return normalizeCurrency(trimmed);
}
