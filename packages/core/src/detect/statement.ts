// Statement range and As-of date (step 1 output).
// See .kiro/specs/subscription-detector/design.md ("Statement info and As-of date").

import { parseIsoDate } from "./dates.js";
import type { CivilDate, Entry } from "./internal-types.js";
import type { StatementInfo } from "./types.js";

/**
 * Builds the `StatementInfo` from the valid entries in Content order (ascending date) and the
 * caller's options. `options` is read only when it is a non-null, non-array object, and
 * `options.asOf` is read once (Req 1.4, 1.14, 7.1, 7.2).
 */
export function buildStatementInfo(sorted: readonly Entry[], options: unknown): StatementInfo {
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const firstDate = first === undefined ? null : first.date.iso;
  const lastDate = last === undefined ? null : last.date.iso;

  const currencySet = new Set<string>();
  for (const entry of sorted) currencySet.add(entry.currency);
  // Default sort compares UTF-16 code units, as required (no locale-aware comparison).
  const currencies = [...currencySet].sort();

  let requested: unknown = undefined;
  if (typeof options === "object" && options !== null && !Array.isArray(options)) {
    requested = (options as { asOf?: unknown }).asOf;
  }
  const parsed = parseIsoDate(requested);
  if (parsed !== null) {
    return { firstDate, lastDate, asOf: parsed.iso, asOfSource: "option", currencies };
  }
  if (lastDate !== null) {
    return { firstDate, lastDate, asOf: lastDate, asOfSource: "statement", currencies };
  }
  return { firstDate, lastDate, asOf: null, asOfSource: null, currencies };
}

/** The As-of date as a `CivilDate`, or `null` when the statement has none. */
export function resolveAsOf(info: StatementInfo): CivilDate | null {
  return parseIsoDate(info.asOf);
}
