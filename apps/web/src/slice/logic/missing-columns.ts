// Which of the three required columns a header row has (Req 3.9). Pure: no React, DOM or clock.
import {
  AMOUNT_HEADERS,
  CREDIT_HEADERS,
  DATE_HEADERS,
  DEBIT_HEADERS,
  DESCRIPTION_HEADERS,
  normalizeHeader,
} from "@zombills/core";

export interface ColumnPresence {
  date: boolean;
  description: boolean;
  /** true when a signed amount column, or both a debit and a credit column, is found */
  amount: boolean;
}

/**
 * Compares each column with the parser's header lists after `normalizeHeader`, the same way the
 * parser does, so the web and the parser agree on what counts as found.
 */
export function findColumns(columns: readonly string[]): ColumnPresence {
  const names = columns.map(normalizeHeader);
  const has = (list: readonly string[]): boolean => names.some((name) => list.includes(name));
  return {
    date: has(DATE_HEADERS),
    description: has(DESCRIPTION_HEADERS),
    amount: has(AMOUNT_HEADERS) || (has(DEBIT_HEADERS) && has(CREDIT_HEADERS)),
  };
}
