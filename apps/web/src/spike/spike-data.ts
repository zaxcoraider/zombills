// Hard-coded fixture for the art spike. Money is integer cents (money.md).

export const SUBSCRIPTION = {
  name: "Netflix",
  monthlyCents: 1549,
  since: "March",
  currency: "USD",
} as const;

export const YEARLY_CENTS = SUBSCRIPTION.monthlyCents * 12;

const FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: SUBSCRIPTION.currency,
});

/** Cents → display string. UI layer only (money.md). */
export function formatCents(cents: number): string {
  return FORMATTER.format(cents / 100);
}
