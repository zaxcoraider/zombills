// Error texts for the error state (Req 4.3–4.6, 4.12). Pure: no React, DOM or clock.
// Text is built only from fixed strings, the parser's reason and filtered column names.
import type { AnalysisOutcome } from "./analyze-statement";
import type { ColumnPresence } from "./missing-columns";

export type PageError =
  | { kind: "too-many-files" }
  | { kind: "too-large" }
  | { kind: "not-csv" }
  | { kind: "empty-file" }
  | { kind: "unreadable-file" }
  | { kind: "parse-error"; reason: string }
  | { kind: "columns-unreadable"; columns: string[]; found: ColumnPresence }
  | { kind: "no-transactions"; rowErrorCount: number };

type ErrorOutcome = Extract<
  AnalysisOutcome,
  { kind: "empty" | "parse-error" | "columns-unreadable" | "no-transactions" }
>;

/** Maps the four error kinds of AnalysisOutcome to a PageError ("empty" → "empty-file"). */
export function errorFromOutcome(outcome: ErrorOutcome): PageError {
  switch (outcome.kind) {
    case "empty":
      return { kind: "empty-file" };
    case "parse-error":
      return { kind: "parse-error", reason: outcome.reason };
    case "columns-unreadable":
      return { kind: "columns-unreadable", columns: outcome.columns, found: outcome.found };
    case "no-transactions":
      return { kind: "no-transactions", rowErrorCount: outcome.rowErrorCount };
  }
}

export interface ErrorMessage {
  /** One sentence, shown as the error heading's text and announced */
  summary: string;
  /** Optional second paragraph: parser reason, or found column names */
  detail: string | null;
}

const MAX_LISTED_NAMES = 10;
const MAX_NAME_LENGTH = 40;

const ISO_DATE = /^\d{4}-\d{1,2}-\d{1,2}$/;
const SLASH_DATE = /^\d{1,2}\/\d{1,2}\/\d{2}(?:\d{2})?$/;
const DOT_DATE = /^\d{1,2}\.\d{1,2}\.\d{2}(?:\d{2})?$/;
const DASH_DATE = /^\d{1,2}-\d{1,2}-\d{2}(?:\d{2})?$/;
const AMOUNT_BODY = /^[\d\s.,'\p{Sc}]*\d[\d\s.,'\p{Sc}]*$/u;

/** Req 4.12: matches one of the parser's five date formats once trimmed. */
export function isDateShaped(name: string): boolean {
  const text = name.trim();
  return (
    ISO_DATE.test(text) || SLASH_DATE.test(text) || DOT_DATE.test(text) || DASH_DATE.test(text)
  );
}

/** Req 4.12: digits, ≤ 1 sign or bracket pair, currency symbols, spaces, . , ' — at least one digit. */
export function isAmountShaped(name: string): boolean {
  let text = name.trim();
  if (/^\(.*\)$/s.test(text)) {
    text = text.slice(1, -1);
  } else if (/^[+-]/.test(text)) {
    text = text.slice(1);
  } else if (/[+-]$/.test(text)) {
    text = text.slice(0, -1);
  }
  return AMOUNT_BODY.test(text);
}

/** Drops date- and amount-shaped names, keeps the first 10, cuts each to 40 characters. */
export function visibleColumnNames(columns: readonly string[]): string[] {
  return columns
    .filter((name) => !isDateShaped(name) && !isAmountShaped(name))
    .slice(0, MAX_LISTED_NAMES)
    .map((name) => {
      const points = Array.from(name);
      return points.length > MAX_NAME_LENGTH
        ? `${points.slice(0, MAX_NAME_LENGTH - 1).join("")}…`
        : name;
    });
}

/** The sentence naming the missing roles in the order date, description, amount; "" when none. */
function missingColumnsSentence(found: ColumnPresence): string {
  const missing: string[] = [];
  if (!found.date) missing.push("date");
  if (!found.description) missing.push("description");
  if (!found.amount) missing.push("amount");
  if (missing.length === 0) return "";
  const last = missing[missing.length - 1];
  const list = missing.length === 1 ? last : `${missing.slice(0, -1).join(", ")} or ${last}`;
  return ` No ${list} column was found.`;
}

export function errorMessage(error: PageError): ErrorMessage {
  switch (error.kind) {
    case "too-many-files":
      return {
        summary: "Only one statement can be read at a time. Drop a single CSV file.",
        detail: null,
      };
    case "too-large":
      return { summary: "This file is larger than 1 MB, so it was not read.", detail: null };
    case "not-csv":
      return { summary: "This file is not a CSV statement.", detail: null };
    case "empty-file":
      return { summary: "The file is empty.", detail: null };
    case "unreadable-file":
      return { summary: "The file could not be opened.", detail: null };
    case "parse-error":
      return { summary: "The statement could not be read.", detail: error.reason };
    case "columns-unreadable": {
      const names = visibleColumnNames(error.columns);
      return {
        summary: `The columns could not be recognised.${missingColumnsSentence(error.found)}`,
        detail:
          names.length === 0 ? "No header row was found." : `Columns found: ${names.join(", ")}.`,
      };
    }
    case "no-transactions":
      return {
        summary:
          error.rowErrorCount > 0
            ? `No rows could be read: ${error.rowErrorCount} rows failed.`
            : "The statement has no transaction rows.",
        detail: null,
      };
  }
}
