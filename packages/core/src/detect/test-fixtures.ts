// Test-only builders for hand-written detector rows. Not part of the build:
// tsconfig.build.json excludes `test-*.ts`.
//
//   charge("2026-01-15", 999, "merchant:gym")   money out
//   credit("2026-01-20", 999, "merchant:gym")   money in; pass the positive amount, it is stored negated
//   zero("2026-01-01", "merchant:gym")          zero-amount row

import type { MerchantSource, NormalizedTransaction } from "../normalize/types.js";

export interface RowOptions {
  /** Default "USD" */
  currency?: string;
  /** Default: "<displayName> <date>" */
  description?: string;
  /** Default: derived from the key */
  displayName?: string;
}

function sourceOf(key: string): MerchantSource {
  if (key.startsWith("unidentified:")) return "unidentified";
  if (key.startsWith("merchant:")) return "generic";
  return "known";
}

function defaultDisplayName(key: string, source: MerchantSource): string {
  if (source === "known") return key;
  const rest = key.slice(key.indexOf(":") + 1);
  return rest === "" ? "Unknown" : rest;
}

function row(
  date: string,
  amountCents: number,
  key: string,
  options: RowOptions,
): NormalizedTransaction {
  const source = sourceOf(key);
  const displayName = options.displayName ?? defaultDisplayName(key, source);
  return {
    date,
    description: options.description ?? `${displayName} ${date}`,
    amountCents,
    currency: options.currency ?? "USD",
    merchant: {
      key,
      displayName,
      source,
      serviceId: source === "known" ? key : null,
      processor: null,
    },
  };
}

/** A charge: money out, `amountCents > 0`. */
export function charge(
  date: string,
  amountCents: number,
  key: string,
  options: RowOptions = {},
): NormalizedTransaction {
  return row(date, amountCents, key, options);
}

/** A credit: money in. `amountCents` is the positive amount; the row carries its negation. */
export function credit(
  date: string,
  amountCents: number,
  key: string,
  options: RowOptions = {},
): NormalizedTransaction {
  return row(date, -amountCents, key, options);
}

/** A zero-amount row. */
export function zero(date: string, key: string, options: RowOptions = {}): NormalizedTransaction {
  return row(date, 0, key, options);
}
