// Assumed-value notes (Req 5.1a). Pure: no React, DOM or clock.
import type { DateFormat } from "@zombills/core";
import type { StatementFacts } from "./analyze-statement";

const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  "yyyy-mm-dd": "year-month-day",
  "dd/mm/yyyy": "day/month/year",
  "mm/dd/yyyy": "month/day/year",
  "dd.mm.yyyy": "day.month.year",
  "dd-mm-yyyy": "day-month-year",
};

/** Req 5.1a: one sentence per Assumed value, in the order currency, date format, sign. */
export function assumedValueNotes(facts: StatementFacts): string[] {
  const notes: string[] = [];
  if (facts.detectedCurrency.source === "default") {
    notes.push(
      `No currency was found in the statement, so amounts are shown in ${facts.detectedCurrency.code}.`,
    );
  }
  if (facts.detectedDateFormat?.assumed) {
    notes.push(`Dates were read as ${DATE_FORMAT_LABELS[facts.detectedDateFormat.format]}.`);
  }
  if (facts.detectedSignConvention?.assumed) {
    const sign = facts.detectedSignConvention.convention === "negative-out" ? "Negative" : "Positive";
    notes.push(`${sign} amounts were read as money out.`);
  }
  return notes;
}
