// Recognition lists for header names (Req 2.1-2.4, 10.4). Entries are compared after
// `normalizeHeader`, so they are written trimmed and in lower case.

export const DATE_HEADERS: readonly string[] = [
  "date",
  "transaction date",
  "posted date",
  "value date",
  "trans. date",
];

export const DESCRIPTION_HEADERS: readonly string[] = [
  "description",
  "memo",
  "narrative",
  "details",
  "merchant",
  "payee",
  "transaction description",
];

export const AMOUNT_HEADERS: readonly string[] = [
  "amount",
  "transaction amount",
  "net amount",
  "value",
];

export const DEBIT_HEADERS: readonly string[] = [
  "debit",
  "debit amount",
  "withdrawal",
  "withdrawals",
];

export const CREDIT_HEADERS: readonly string[] = ["credit", "credit amount", "deposit", "deposits"];

export const CURRENCY_HEADERS: readonly string[] = ["currency", "ccy"];

/** Trims surrounding whitespace and lower-cases, independent of the user's locale (Req 2.10). */
export function normalizeHeader(name: string): string {
  return name.trim().toLowerCase();
}

/** Whether a header cell, once normalized, is one of `names`. */
export function isHeaderIn(cell: string, names: readonly string[]): boolean {
  return names.includes(normalizeHeader(cell));
}
