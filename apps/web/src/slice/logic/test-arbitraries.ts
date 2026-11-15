// Generators for the property tests. Imported only by tests, so it never reaches the bundle.
import fc from "fast-check";
import {
  AMOUNT_HEADERS,
  CREDIT_HEADERS,
  DATE_HEADERS,
  DEBIT_HEADERS,
  DESCRIPTION_HEADERS,
  type ClassifiedSubscription,
  type Subscription,
  type UsageAnswer,
} from "@zombills/core";
import type { AnswerRecord } from "./graveyard";

export const MAX_YEARLY_COST_CENTS = 999_999_9900 * 52;

export const CURRENCIES = ["USD", "EUR", "GBP", "JPY"] as const;

/** Few distinct merchants, so equal merchants and code-unit edge cases (`"Z"` before `"a"`) are common. */
const merchantArb = fc.oneof(
  fc.constantFrom("Z", "a", "A", "z", "Netflix", "Spotify", ""),
  fc.string({ maxLength: 8 }),
);

/** Small values make ties on cost likely; the wide range covers the Req 5.11 bounds. */
const yearlyCostArb = fc.oneof(
  fc.constantFrom(0, 100, 1_000, 15_000),
  fc.integer({ min: 0, max: MAX_YEARLY_COST_CENTS }),
);

/**
 * A structurally valid Subscription. The `id` is drawn from a small set, so use `subscriptionListArb`
 * when ids must be unique within an array.
 */
export const subscriptionArb: fc.Arbitrary<Subscription> = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 6 }),
    merchant: merchantArb,
    currency: fc.constantFrom(...CURRENCIES),
    cadence: fc.constantFrom("weekly", "monthly", "yearly"),
    status: fc.constantFrom("active", "ended"),
    cadenceAssumed: fc.boolean(),
    yearlyCostCents: yearlyCostArb,
    source: fc.constantFrom("known", "generic", "unidentified"),
    confidence: fc.constantFrom("high", "medium", "low"),
  })
  .map((v): Subscription => {
    const date = "2026-01-12";
    return {
      id: v.id,
      merchant: v.merchant,
      merchantKey: v.merchant.toLowerCase(),
      serviceId: null,
      source: v.source,
      currency: v.currency,
      cadence: v.cadence,
      charges: [],
      currentAmountCents: v.yearlyCostCents,
      yearlyCostCents: v.yearlyCostCents,
      labels: [],
      priceHistory: [],
      status: v.status,
      confidence: v.confidence,
      evidence: {
        regularChargeCount: 3,
        firstChargeDate: date,
        lastChargeDate: date,
        nextExpectedDate: date,
        missedPeriods: 0,
        lateChargeDates: [],
        cadenceAssumed: v.cadenceAssumed,
        introCharge: null,
        freeTrialDate: null,
        startedInStatement: false,
        partialRefunds: [],
      },
    };
  });

/** A Subscription with the classifier's two extra fields set to null, as for an unlabelled one. */
export const classifiedSubscriptionArb: fc.Arbitrary<ClassifiedSubscription> = subscriptionArb.map(
  (s): ClassifiedSubscription => ({ ...s, priceRise: null, trial: null }),
);

/** An array of subscriptions with unique ids (design "Generators"). */
export function subscriptionListArb(maxLength: number): fc.Arbitrary<Subscription[]> {
  return fc.uniqueArray(subscriptionArb, { maxLength, selector: (s) => s.id });
}

const ALL_HEADER_NAMES: readonly string[] = [
  ...DATE_HEADERS,
  ...DESCRIPTION_HEADERS,
  ...AMOUNT_HEADERS,
  ...DEBIT_HEADERS,
  ...CREDIT_HEADERS,
];

const NOISE_HEADER_NAMES = ["Balance", "Reference", "Category", "Type", "Notes", "Account", "Code"];

/** A header name with case and surrounding-space variants (ASCII, so `toLowerCase` agrees everywhere). */
const headerCellArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(...ALL_HEADER_NAMES, ...NOISE_HEADER_NAMES),
    fc.constantFrom("keep", "upper", "title"),
    fc.constantFrom("", " ", "  ", "\t"),
    fc.constantFrom("", " ", "  ", "\t"),
  )
  .map(([name, casing, before, after]) => {
    const cased =
      casing === "upper"
        ? name.toUpperCase()
        : casing === "title"
          ? name.replace(/\b[a-z]/g, (c) => c.toUpperCase())
          : name;
    return `${before}${cased}${after}`;
  });

/** A header row of 3 to 8 cells drawn from every header list and from noise names (design P5). */
export const headerRowArb: fc.Arbitrary<string[]> = fc.array(headerCellArb, {
  minLength: 3,
  maxLength: 8,
});

const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * A date cell in one of the parser's five formats. The four non-ISO formats get a 2- or 4-digit year
 * and the cell may be padded with spaces. Day is 1–28, so every value is a real date.
 */
export const dateCellArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom("iso", "dd/mm", "mm/dd", "dd.mm", "dd-mm"),
    fc.integer({ min: 2000, max: 2099 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
    fc.boolean(),
    fc.constantFrom("", " ", "  "),
    fc.constantFrom("", " ", "  "),
  )
  .map(([format, year, month, day, shortYear, before, after]) => {
    const y = shortYear ? pad2(year % 100) : String(year);
    const d = pad2(day);
    const m = pad2(month);
    const text =
      format === "iso"
        ? `${year}-${m}-${d}`
        : format === "dd/mm"
          ? `${d}/${m}/${y}`
          : format === "mm/dd"
            ? `${m}/${d}/${y}`
            : format === "dd.mm"
              ? `${d}.${m}.${y}`
              : `${d}-${m}-${y}`;
    return `${before}${text}${after}`;
  });

/**
 * An amount cell: digits grouped with `.`, `,`, `'` or space, an optional sign or brackets, and an
 * optional currency symbol. Every value contains at least one digit.
 */
export const amountCellArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.integer({ min: 0, max: 99_999 }),
    fc.integer({ min: 0, max: 99 }),
    fc.constantFrom(".", ","),
    fc.constantFrom("", ",", ".", "'", " "),
    fc.constantFrom("none", "minus", "plus", "trailing-minus", "brackets"),
    fc.constantFrom("", "$", "£", "€", "¥"),
  )
  .map(([whole, cents, decimalMark, groupMark, sign, symbol]) => {
    const digits = String(whole);
    const grouped = groupMark === "" ? digits : digits.replace(/\B(?=(\d{3})+(?!\d))/g, groupMark);
    const body = `${symbol}${grouped}${decimalMark}${pad2(cents)}`;
    switch (sign) {
      case "minus":
        return `-${body}`;
      case "plus":
        return `+${body}`;
      case "trailing-minus":
        return `${body}-`;
      case "brackets":
        return `(${body})`;
      default:
        return body;
    }
  });

const DELIMITERS = [",", ";", "\t", "|"] as const;

const MERCHANT_WORDS = [
  "NETFLIX.COM",
  "SPOTIFY",
  "Gym Membership",
  "TESCO STORES 1234",
  "Coffee",
  "ACME",
];

/** Quotes a cell when it holds a delimiter, a quote or a line break; doubles inner quotes. */
function quoteCell(cell: string): string {
  return /[",;\t|\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/** A cell for the free-form branch: a date, an amount, a merchant word, empty, or a quoted odd one. */
const looseCellArb: fc.Arbitrary<string> = fc.oneof(
  dateCellArb,
  amountCellArb,
  fc.constantFrom(...MERCHANT_WORDS),
  fc.constant(""),
  fc.constantFrom("a,b", "line\nbreak", 'say "hi"', "x;y|z", "tab\there", "\r\n"),
);

/** A header row of three cells, either real header names or noise. */
const csvHeaderArb: fc.Arbitrary<string[]> = fc.oneof(
  fc
    .constantFrom<string[][]>(
      ["Date", "Description", "Amount"],
      ["date", "description", "debit", "credit"],
      ["Posting Date", "Description", "Paid out", "Paid in"],
      ["Date", "Details", "Amount", "Balance"],
    )
    .map((header) => [...header]),
  headerRowArb,
  fc.array(fc.constantFrom(...NOISE_HEADER_NAMES), { minLength: 1, maxLength: 4 }),
);

const preambleArb: fc.Arbitrary<string> = fc.constantFrom(
  "",
  "",
  "Account statement\n",
  "Account: 12345\nPeriod: Jan to Mar\n\n",
);

/** Rows of loose cells under a header, 0 to 40 rows. */
const looseCsvArb: fc.Arbitrary<{ header: string[]; rows: string[][] }> = csvHeaderArb.chain(
  (header) =>
    fc.record({
      header: fc.constant(header),
      rows: fc.array(fc.array(looseCellArb, { minLength: 1, maxLength: header.length + 1 }), {
        maxLength: 40,
      }),
    }),
);

/** A statement that repeats one merchant monthly, so the parser maps it and the detector finds it. */
const recurringCsvArb: fc.Arbitrary<{ header: string[]; rows: string[][] }> = fc
  .record({
    merchant: fc.constantFrom(...MERCHANT_WORDS),
    months: fc.integer({ min: 3, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
    cents: fc.integer({ min: 99, max: 99_999 }),
    others: fc.array(
      fc.tuple(fc.integer({ min: 1, max: 12 }), fc.constantFrom(...MERCHANT_WORDS)),
      {
        maxLength: 5,
      },
    ),
  })
  .map(({ merchant, months, day, cents, others }) => {
    const money = (c: number): string => {
      const digits = String(c).padStart(3, "0");
      return `-${digits.slice(0, -2)}.${digits.slice(-2)}`;
    };
    const rows = Array.from({ length: months }, (_, i) => [
      `2025-${pad2(i + 1)}-${pad2(day)}`,
      merchant,
      money(cents),
    ]);
    for (const [month, name] of others) {
      rows.push([`2025-${pad2(month)}-${pad2(Math.min(28, day + 3))}`, name, money(cents + 1_234)]);
    }
    return { header: ["Date", "Description", "Amount"], rows };
  });

/**
 * A CSV-like text: a header row, a delimiter from `, ; \t |`, 0–40 rows, optionally a preamble and a
 * BOM. One branch repeats a merchant monthly so the `"results"` kind is reached often enough for P3.
 */
export const csvLikeArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.oneof(looseCsvArb, recurringCsvArb, recurringCsvArb),
    fc.constantFrom(...DELIMITERS),
    preambleArb,
    fc.boolean(),
  )
  .map(([{ header, rows }, delimiter, preamble, bom]) => {
    const quoted = (cells: readonly string[]): string =>
      cells
        .map((c) => (c.includes(delimiter) || /["\r\n]/.test(c) ? quoteCell(c) : c))
        .join(delimiter);
    const body = [header, ...rows].map(quoted).join("\n");
    return `${bom ? "\uFEFF" : ""}${preamble}${body}\n`;
  });

const CADENCE_FACTOR = { weekly: 52, monthly: 12, yearly: 1 } as const;

/** Largest `currentAmountCents` the answerable generators draw (design "Generators"). */
const MAX_AMOUNT_CENTS = 999_999_9900;

const answerableMerchantArb = fc.constantFrom("Apple", "Netflix", "Spotify", "Gym", "Z", "a", "");

/**
 * Like `subscriptionArb`, but `yearlyCostCents = currentAmountCents × factor(cadence)`, which is the
 * detector's guarantee that the answer-record saving rule relies on. `charges` stays `[]`.
 */
export const answerableSubscriptionArb: fc.Arbitrary<Subscription> = fc
  .tuple(
    subscriptionArb,
    fc.oneof(fc.constantFrom(0, 99, 1_599, 21_588), fc.integer({ min: 0, max: MAX_AMOUNT_CENTS })),
    answerableMerchantArb,
  )
  .map(([s, currentAmountCents, merchant]): Subscription => ({
    ...s,
    merchant,
    merchantKey: merchant.toLowerCase(),
    currentAmountCents,
    yearlyCostCents: currentAmountCents * CADENCE_FACTOR[s.cadence],
  }));

/** Unique ids, small merchant set, and at least two currencies once the list has two items. */
export function answerableListArb(max: number): fc.Arbitrary<Subscription[]> {
  return fc
    .uniqueArray(answerableSubscriptionArb, { maxLength: max, selector: (s) => s.id })
    .map((list) =>
      list.map((s, i): Subscription => {
        if (list.length < 2 || i > 1) return s;
        const currency = CURRENCIES[i] ?? "USD";
        return { ...s, currency };
      }),
    );
}

const SAVING_CURRENCIES = [...CURRENCIES, "CHF", "SEK"] as const;

/** Records over at least three currency codes; `yearlySavingCents` is `null`, small or large. */
export const answerRecordArb: fc.Arbitrary<AnswerRecord> = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 6 }),
    merchant: answerableMerchantArb,
    currency: fc.constantFrom(...SAVING_CURRENCIES),
    cadence: fc.constantFrom("weekly", "monthly", "yearly"),
    currentAmountCents: fc.integer({ min: 0, max: MAX_AMOUNT_CENTS }),
    answer: fc.constantFrom("still-using", "not-using"),
    cadenceAssumed: fc.boolean(),
    yearlySavingCents: fc.oneof(
      fc.constant(null),
      fc.constantFrom(0, 100, 1_000, 15_000),
      fc.integer({ min: 0, max: MAX_YEARLY_COST_CENTS }),
    ),
  })
  .map((r): AnswerRecord => r);

export type GraveyardAction =
  | { type: "record"; id: string; answer: UsageAnswer }
  | { type: "unbury"; id: string }
  | { type: "bury-after-all"; id: string }
  | { type: "skip"; id: string }
  | { type: "answer-now"; id: string }
  | { type: "refresh"; seed: number };

/** Actions over a given id pool. `refresh` carries a seed the test uses to redraw the list. */
export function graveyardActionArb(ids: readonly string[]): fc.Arbitrary<GraveyardAction> {
  const idArb = ids.length > 0 ? fc.constantFrom(...ids) : fc.constant("none");
  return fc.oneof(
    fc.record({
      type: fc.constant("record" as const),
      id: idArb,
      answer: fc.constantFrom<UsageAnswer>("still-using", "not-using"),
    }),
    fc.record({ type: fc.constant("unbury" as const), id: idArb }),
    fc.record({ type: fc.constant("bury-after-all" as const), id: idArb }),
    fc.record({ type: fc.constant("skip" as const), id: idArb }),
    fc.record({ type: fc.constant("answer-now" as const), id: idArb }),
    fc.record({ type: fc.constant("refresh" as const), seed: fc.integer() }),
  );
}

/** Freezes a value and everything reachable from it, so any mutation throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Reflect.ownKeys(value)) {
      deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    }
  }
  return value;
}
