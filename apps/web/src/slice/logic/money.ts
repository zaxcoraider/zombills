/**
 * Money display (Req 6). The only place in apps/web that turns minor units
 * into display text.
 * @throws RangeError when minorUnits is not a safe integer.
 */
export function formatMoney(minorUnits: number, currency: string, locale?: string): string {
  if (!Number.isSafeInteger(minorUnits)) {
    throw new RangeError("formatMoney needs a safe integer number of minor units");
  }
  const abs = Math.abs(minorUnits);
  const cents = abs % 100;
  const whole = (abs - cents) / 100;
  const decimal = `${minorUnits < 0 ? "-" : ""}${whole}.${String(cents).padStart(2, "0")}`;

  // The typings mark this optional; a currency format always resolves it. 2 is the safe fallback.
  const defaults =
    new Intl.NumberFormat(locale, { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  const fraction =
    defaults > 2 || (defaults < 2 && cents !== 0)
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : {};

  // The string above always has the shape `-?<digits>.<2 digits>`, a valid StringNumericLiteral.
  return new Intl.NumberFormat(locale, { style: "currency", currency, ...fraction }).format(
    decimal as Intl.StringNumericLiteral,
  );
}
