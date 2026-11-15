import type { PriceRise, TrialDetails } from "@zombills/core";
import { formatDisplayDate } from "./display-date";
import { formatMoney } from "./money";

/** One piece of a label sentence. Money pieces are rendered in a `.money` span. */
export type TextPart = { kind: "text" | "money"; text: string };

function text(value: string): TextPart {
  return { kind: "text", text: value };
}

/** "Price went up from $15.49 (2 Jan 2026) to $17.99 (+$30.00 a year)" as parts (Req 9.3). */
export function priceRiseParts(rise: PriceRise, currency: string, locale?: string): TextPart[] {
  const money = (cents: number): TextPart => ({
    kind: "money",
    text: formatMoney(cents, currency, locale),
  });
  return [
    text("Price went up from "),
    money(rise.firstSeen.amountCents),
    text(` (${formatDisplayDate(rise.firstSeen.date)}) to `),
    money(rise.currentAmountCents),
    text(" (+"),
    money(rise.increasePerYearCents),
    text(" a year)"),
  ];
}

/** The trial-trap line as parts, chosen by which evidence `trial` holds (Req 9.4). */
export function trialParts(trial: TrialDetails, currency: string, locale?: string): TextPart[] {
  const money = (cents: number): TextPart => ({
    kind: "money",
    text: formatMoney(cents, currency, locale),
  });
  const end = formatDisplayDate(trial.firstFullCharge.date);
  const full = money(trial.firstFullCharge.amountCents);
  const { freeTrialDate, introCharge } = trial;

  if (freeTrialDate !== null && introCharge !== null) {
    return [
      text(
        `Free trial and intro price ended on ${end} (free on ${formatDisplayDate(freeTrialDate)}, `,
      ),
      money(introCharge.amountCents),
      text(` on ${formatDisplayDate(introCharge.date)}, then `),
      full,
      text(")"),
    ];
  }
  if (freeTrialDate !== null) {
    return [
      text(`Free trial ended on ${end} (free on ${formatDisplayDate(freeTrialDate)}, then `),
      full,
      text(")"),
    ];
  }
  if (introCharge !== null) {
    return [
      text(`Intro price ended on ${end} (`),
      money(introCharge.amountCents),
      text(` on ${formatDisplayDate(introCharge.date)}, then `),
      full,
      text(")"),
    ];
  }
  return [];
}

/** The sentence as one string: the texts joined with "". */
export function partsToText(parts: readonly TextPart[]): string {
  return parts.map((part) => part.text).join("");
}
