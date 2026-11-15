import {
  EMPTY_CSV_REASON,
  NO_CONTENT_ROWS_REASON,
  detectSubscriptions,
  normalizeTransactions,
  parseStatement,
} from "@zombills/core";
import type {
  CurrencyInfo,
  DateFormatInfo,
  SignConventionInfo,
  StatementInfo,
  Subscription,
} from "@zombills/core";
import { findColumns } from "./missing-columns";
import type { ColumnPresence } from "./missing-columns";
import { currencyTotals } from "./totals";
import type { CurrencyTotal } from "./totals";

/** Fixed text for a thrown Pipeline error; contains no statement content (Req 3.3). */
export const GENERIC_FAILURE_REASON = "An unexpected problem stopped the statement from being read";

/** What the parser and detector found about the statement as a whole. */
export interface StatementFacts {
  transactionCount: number;
  rowErrorCount: number;
  statement: StatementInfo;
  detectedCurrency: CurrencyInfo;
  detectedDateFormat: DateFormatInfo | null;
  detectedSignConvention: SignConventionInfo | null;
}

export type AnalysisOutcome =
  | { kind: "empty" }
  | { kind: "parse-error"; reason: string }
  | { kind: "columns-unreadable"; columns: string[]; found: ColumnPresence }
  | { kind: "no-transactions"; rowErrorCount: number }
  | ({ kind: "no-subscriptions" } & StatementFacts)
  | ({ kind: "results"; subscriptions: Subscription[]; totals: CurrencyTotal[] } & StatementFacts);

export type ResultsOutcome = Extract<AnalysisOutcome, { kind: "results" }>;
export type NoSubscriptionsOutcome = Extract<AnalysisOutcome, { kind: "no-subscriptions" }>;

/** Runs the Pipeline with no options. Pure and total: never throws (Req 3.1–3.5). */
export function analyzeStatement(csv: string): AnalysisOutcome {
  try {
    const parsed = parseStatement(csv);

    if (parsed.status === "error") {
      if (parsed.reason === EMPTY_CSV_REASON || parsed.reason === NO_CONTENT_ROWS_REASON) {
        return { kind: "empty" };
      }
      return { kind: "parse-error", reason: parsed.reason };
    }

    if (parsed.status === "mapping-required") {
      return {
        kind: "columns-unreadable",
        columns: [...parsed.columns],
        found: findColumns(parsed.columns),
      };
    }

    if (parsed.transactions.length === 0) {
      return { kind: "no-transactions", rowErrorCount: parsed.rowErrors.length };
    }

    const detection = detectSubscriptions(normalizeTransactions(parsed.transactions));
    const facts: StatementFacts = {
      transactionCount: parsed.transactions.length,
      rowErrorCount: parsed.rowErrors.length,
      statement: detection.statement,
      detectedCurrency: parsed.detectedCurrency,
      detectedDateFormat: parsed.detectedDateFormat,
      detectedSignConvention: parsed.detectedSignConvention,
    };

    const { subscriptions } = detection;
    if (subscriptions.length === 0) {
      return { kind: "no-subscriptions", ...facts };
    }
    return {
      kind: "results",
      subscriptions,
      totals: currencyTotals(subscriptions, detection.statement.currencies),
      ...facts,
    };
  } catch {
    // The error object is dropped on purpose: it could carry statement text (Req 3.3, 7.4).
    return { kind: "parse-error", reason: GENERIC_FAILURE_REASON };
  }
}
