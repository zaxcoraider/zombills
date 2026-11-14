import { negate } from "./amount.js";
import type { AmountOutcome } from "./internal-types.js";
import { ParseError } from "./parse-error.js";

/**
 * How a debit or credit cell counts when deciding which of the two holds the amount (Req 7.6).
 *
 * - `empty`: nothing but whitespace.
 * - `zero`: an amount that parses to 0, such as "0.00" or "-0.00". Treated like an empty cell.
 * - `populated`: a non-zero amount, or content that cannot be parsed. An unparseable cell counts
 *   as populated so that it is reported as a bad amount rather than silently ignored (Req 7.5).
 */
export type CellState = "empty" | "zero" | "populated";

export function classifyCell(raw: string, outcome: AmountOutcome): CellState {
  if (raw.trim() === "") {
    return "empty";
  }
  if (outcome.ok && outcome.cents === 0) {
    return "zero";
  }
  return "populated";
}

interface DebitCreditCell {
  raw: string;
  outcome: AmountOutcome;
}

/**
 * Combines a row's debit and credit cells into one stored amount, where positive is money out and
 * negative is money in (Req 7.1-7.5).
 *
 * - Only the debit cell is populated: its absolute value, positive. "50.00" and "-50.00" both give 5000.
 * - Only the credit cell is populated: the negative of its absolute value. Both give -5000.
 * - Neither is populated: 0 if at least one cell is a literal zero, otherwise an error.
 * - Both are populated: an error.
 *
 * @throws ParseError when the row has no usable amount, has two, or a populated cell is not an amount.
 */
export function combineDebitCredit(debit: DebitCreditCell, credit: DebitCreditCell): number {
  const debitState = classifyCell(debit.raw, debit.outcome);
  const creditState = classifyCell(credit.raw, credit.outcome);
  const debitPopulated = debitState === "populated";
  const creditPopulated = creditState === "populated";

  if (debitPopulated && creditPopulated) {
    throw new ParseError("amount", "Both the debit and the credit cell have an amount");
  }
  if (debitPopulated) {
    if (!debit.outcome.ok) {
      throw new ParseError("debit", debit.outcome.reason);
    }
    return Math.abs(debit.outcome.cents);
  }
  if (creditPopulated) {
    if (!credit.outcome.ok) {
      throw new ParseError("credit", credit.outcome.reason);
    }
    return negate(Math.abs(credit.outcome.cents));
  }
  if (debitState === "zero" || creditState === "zero") {
    return 0;
  }
  throw new ParseError("amount", "Both the debit and the credit cell are empty");
}
