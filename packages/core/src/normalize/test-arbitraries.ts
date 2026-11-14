// Test-only generators for the merchant normalizer (design "Generators"). Not part of the build:
// tsconfig.build.json excludes `test-*.ts`.
//
// All generated noise is built from the constants in noise-lists.ts where a list exists, and every
// generated description keeps its core (a variant or a merchant name) free of separators, so the
// core is never changed by the noise around it.

import fc from "fast-check";
import { fold } from "./fold.js";
import { KNOWN_SERVICES } from "./known-services.js";
import { matchKnownService } from "./match-known.js";
import { CARD_PREFIXES, LOCATION_CODES, MONTHS, PROCESSOR_FORMS, TLDS } from "./noise-lists.js";

// ---------------------------------------------------------------------------------------------
// Word sets
// ---------------------------------------------------------------------------------------------

/** Every token of every Known service variant, folded. */
export const VARIANT_TOKENS: ReadonlySet<string> = new Set(
  KNOWN_SERVICES.flatMap((service) => service.variants.flatMap((v) => v.text.split(" "))),
);

/** Words that rules read as noise or structure, but that are not in a list of noise-lists.ts. */
const EXTRA_NOISE_WORDS: readonly string[] = [
  "store",
  "no",
  "nr",
  "card",
  "ending",
  "http",
  "https",
  "www",
];

/** Every folded word that a name must not contain, so that no rule can touch a name word. */
const RESERVED_WORDS: ReadonlySet<string> = new Set([
  ...CARD_PREFIXES.flatMap((prefix) => prefix.flatMap((token) => token.split("-"))),
  ...MONTHS,
  ...TLDS.flatMap((tld) => tld.split(".")),
  ...LOCATION_CODES,
  ...PROCESSOR_FORMS.flatMap((form) => form.tokens.flatMap((token) => token.split("."))),
  ...EXTRA_NOISE_WORDS,
  ...[...VARIANT_TOKENS].flatMap((token) => [token, token.replace(/[^\p{L}]/gu, "")]),
]);

// ---------------------------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------------------------

function digitsArb(min: number, max: number): fc.Arbitrary<string> {
  return fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: min, maxLength: max })
    .map((digits) => digits.join(""));
}

/** A run of spaces and `*`, possibly empty. */
const starsAndSpacesArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(" ", " ", "*"), { maxLength: 3 })
  .map((parts) => parts.join(""));

/** A separator between parts: any run of spaces and `*` that contains at least one space. */
const separatorArb: fc.Arbitrary<string> = fc
  .tuple(starsAndSpacesArb, starsAndSpacesArb)
  .map(([before, after]) => before + " " + after);

/** Random ASCII letter case: letter number i is upper case when `bits[i % bits.length]` is true. */
export function applyCase(text: string, bits: readonly boolean[]): string {
  if (bits.length === 0) return text;
  let letterIndex = 0;
  let result = "";
  for (const char of text) {
    if ((char >= "a" && char <= "z") || (char >= "A" && char <= "Z")) {
      result += bits[letterIndex % bits.length] === true ? char.toUpperCase() : char.toLowerCase();
      letterIndex++;
    } else {
      result += char;
    }
  }
  return result;
}

const caseBitsArb: fc.Arbitrary<boolean[]> = fc.array(fc.boolean(), {
  minLength: 1,
  maxLength: 12,
});

// ---------------------------------------------------------------------------------------------
// Noise items
// ---------------------------------------------------------------------------------------------

/** A reference number (Req 3.8): 4+ digits, or 6+ letters and digits with 2+ digits and a letter. */
export const referenceTokenArb: fc.Arbitrary<string> = fc
  .oneof(
    digitsArb(4, 12),
    fc.stringMatching(/^[A-Z0-9]{6,12}$/u).filter((token) => {
      const digits = token.replace(/[^0-9]/gu, "").length;
      return digits >= 2 && /[A-Z]/u.test(token);
    }),
  )
  .filter((token) => !VARIANT_TOKENS.has(token.toLowerCase()));

/** Phone numbers in every shape step 4 removes (Req 3.6). */
export const phoneArb: fc.Arbitrary<string> = fc.oneof(
  fc.tuple(digitsArb(3, 3), digitsArb(3, 3), digitsArb(4, 4)).map(([a, b, c]) => `${a}-${b}-${c}`),
  fc
    .tuple(digitsArb(3, 3), digitsArb(3, 3), digitsArb(4, 4))
    .map(([a, b, c]) => `1-${a}-${b}-${c}`),
  fc.tuple(digitsArb(3, 3), digitsArb(3, 3), digitsArb(4, 4)).map(([a, b, c]) => `${a}.${b}.${c}`),
  digitsArb(7, 15),
  fc
    .tuple(digitsArb(3, 3), digitsArb(3, 3), digitsArb(4, 4))
    .map(([a, b, c]) => `(${a}) ${b} ${c}`),
  fc
    .tuple(digitsArb(1, 3), digitsArb(2, 2), digitsArb(4, 4), digitsArb(4, 4))
    .map(([cc, a, b, c]) => `+${cc} ${a} ${b} ${c}`),
  fc.tuple(digitsArb(3, 3), digitsArb(3, 3), digitsArb(4, 4)).map(([a, b, c]) => `${a} ${b} ${c}`),
  fc
    .tuple(digitsArb(3, 3), digitsArb(3, 3), digitsArb(4, 4))
    .map(([a, b, c]) => `1 ${a} ${b} ${c}`),
);

/** A date with its day and month, in any Req 3.5 form. Values are valid: day 1-31, month 1-12. */
export const dateArb: fc.Arbitrary<string> = fc
  .record({
    day: fc.integer({ min: 1, max: 31 }),
    month: fc.integer({ min: 1, max: 12 }),
    year: fc.integer({ min: 2000, max: 2099 }),
    padDay: fc.boolean(),
    padMonth: fc.boolean(),
    form: fc.integer({ min: 0, max: 11 }),
  })
  .map(({ day, month, year, padDay, padMonth, form }) => {
    const d = padDay ? String(day).padStart(2, "0") : String(day);
    const m = padMonth ? String(month).padStart(2, "0") : String(month);
    const mon = (MONTHS[month - 1] ?? "jan").toUpperCase();
    const yy = String(year).slice(2);
    switch (form) {
      case 0:
        return `${year}-${m}-${d}`;
      case 1:
        return `${d}/${m}`;
      case 2:
        return `${d}/${m}/${yy}`;
      case 3:
        return `${d}/${m}/${year}`;
      case 4:
        return `${d}.${m}`;
      case 5:
        return `${d}.${m}.${yy}`;
      case 6:
        return `${d}.${m}.${year}`;
      case 7:
        return `${d}-${m}`;
      case 8:
        return `${day}${mon}`;
      case 9:
        return `${mon}${day}`;
      case 10:
        return `${day} ${mon}`;
      default:
        return `${mon} ${day}`;
    }
  });

/** Store numbers (Req 3.9). */
const storeNumberArb: fc.Arbitrary<string> = fc.oneof(
  digitsArb(1, 4).map((n) => `#${n}`),
  digitsArb(1, 4).map((n) => `STORE ${n}`),
  digitsArb(1, 3).map((n) => `NO ${n}`),
  digitsArb(1, 3).map((n) => `NR ${n}`),
);

/** Masked card numbers (Req 3.3). */
const maskedCardArb: fc.Arbitrary<string> = fc.oneof(
  digitsArb(4, 4).map((n) => `XXXX${n}`),
  digitsArb(4, 4).map((n) => `****${n}`),
  digitsArb(4, 4).map((n) => `CARD ENDING ${n}`),
  digitsArb(4, 4).map((n) => `CARD ${n}`),
  digitsArb(4, 4).map((n) => `CARD NO ${n}`),
);

/** Domain tokens that are not the first token of a description (Req 3.7). */
const domainArb: fc.Arbitrary<string> = fc.constantFrom(
  "AMZN.COM/BILL",
  "HELP.MAX.COM",
  "G.CO/HELPPAY",
  "WWW.EXAMPLE.COM",
  "SUPPORT.APPLE.COM/BILL",
  "EXAMPLE.CO.UK",
);

const locationCodeArb: fc.Arbitrary<string> = fc.constantFrom(...LOCATION_CODES);

/** One trailing noise item. */
const suffixItemArb: fc.Arbitrary<string> = fc.oneof(
  phoneArb,
  referenceTokenArb,
  dateArb,
  storeNumberArb,
  maskedCardArb,
  domainArb,
  locationCodeArb,
);

/** A card, POS or debit prefix from the Req 3.2 list. */
const prefixArb: fc.Arbitrary<string> = fc
  .constantFrom(...CARD_PREFIXES)
  .map((tokens) => tokens.join(" "));

/** Processor forms as banks print them (Req 3.4). The text always ends where the merchant starts. */
const PROCESSOR_RENDERINGS: readonly string[] = [
  "PAYPAL *",
  "PP*",
  "SQ *",
  "SP *",
  "AMZN Mktp US*",
  "AMAZON MKTPLACE ",
  "GOOGLE *",
  "APPLE.COM/BILL ",
  "SUMUP *",
  "IZ *",
  "ZETTLE_*",
  "TST*",
];

const processorArb: fc.Arbitrary<string> = fc.constantFrom(...PROCESSOR_RENDERINGS);

// ---------------------------------------------------------------------------------------------
// noiseArb
// ---------------------------------------------------------------------------------------------

/** Noise around a core text: `before + core + after`, then random ASCII case from `caseBits`. */
export interface Noise {
  before: string;
  after: string;
  caseBits: readonly boolean[];
}

/** Puts the noise around a core and applies its random letter case to the whole text. */
export function applyNoise(noise: Noise, core: string): string {
  return applyCase(noise.before + core + noise.after, noise.caseBits);
}

/**
 * Optional card prefix, optional processor form, then 0-4 suffix items (phones, references, dates,
 * store numbers, masked card numbers, domain tokens, location codes), with random runs of spaces
 * and `*` between the parts and random ASCII letter case.
 */
export const noiseArb: fc.Arbitrary<Noise> = fc
  .record({
    prefix: fc.option(prefixArb, { nil: null }),
    prefixGap: separatorArb,
    processor: fc.option(processorArb, { nil: null }),
    processorGap: starsAndSpacesArb,
    suffix: fc.array(fc.tuple(separatorArb, suffixItemArb), { maxLength: 4 }),
    caseBits: caseBitsArb,
  })
  .map(({ prefix, prefixGap, processor, processorGap, suffix, caseBits }) => {
    let before = "";
    if (prefix !== null) before += prefix + prefixGap;
    if (processor !== null) before += processor + processorGap;
    const after = suffix.map(([gap, item]) => gap + item).join("");
    return { before, after, caseBits };
  });

// ---------------------------------------------------------------------------------------------
// genericNameArb
// ---------------------------------------------------------------------------------------------

/** A word of 3-12 ASCII or Latin-1 letters that no rule and no Known service variant uses. */
const nameWordArb: fc.Arbitrary<string> = fc
  .stringMatching(/^[a-zA-ZÀ-ÖØ-öø-ÿ]{3,12}$/u)
  .filter((word) => !RESERVED_WORDS.has(fold(word)));

/** 1-4 name words that do not match any Known service variant (Req 5.6). */
export const genericNameArb: fc.Arbitrary<string> = fc
  .array(nameWordArb, { minLength: 1, maxLength: 4 })
  .map((words) => words.join(" "))
  .filter((name) => {
    const tokens = fold(name).split(" ");
    return matchKnownService(tokens, tokens) === null;
  });

// ---------------------------------------------------------------------------------------------
// unidentifiedArb
// ---------------------------------------------------------------------------------------------

/**
 * A description that carries no merchant: `base` is a processor form (or nothing) followed by
 * reference and phone numbers. `start` and `end` hold whole tokens that change from month to month
 * and must not change the key: prefixes (start only, since only a leading prefix is noise),
 * masked card numbers and dates.
 */
export interface UnidentifiedCase {
  base: string;
  start: readonly string[];
  end: readonly string[];
}

/** The full description of a case, with its start and end tokens separated by single spaces. */
export function describeUnidentified(c: UnidentifiedCase): string {
  return [...c.start, c.base, ...c.end].filter((part) => part !== "").join(" ");
}

/**
 * True when a prefix ending in `card` sits directly in front of a 4-digit base. `DEBIT CARD 1234`
 * is a masked card number (Req 3.3), not a prefix followed by a reference number, so such a case
 * does not keep its base in the key.
 */
export function readsAsCardNumber(c: Pick<UnidentifiedCase, "base" | "start">): boolean {
  const last = c.start[c.start.length - 1];
  return last !== undefined && /card$/iu.test(last) && /^[0-9]{4}(\s|$)/u.test(c.base);
}

export const unidentifiedArb: fc.Arbitrary<UnidentifiedCase> = fc
  .record({
    processor: fc.option(processorArb, { nil: null }),
    items: fc.array(fc.oneof(referenceTokenArb, phoneArb), { maxLength: 3 }),
    prefix: fc.option(prefixArb, { nil: null }),
    startItems: fc.array(fc.oneof(maskedCardArb, dateArb), { maxLength: 2 }),
    end: fc.array(fc.oneof(maskedCardArb, dateArb), { maxLength: 2 }),
    caseBits: caseBitsArb,
  })
  .map(({ processor, items, prefix, startItems, end, caseBits }) => ({
    base: applyCase((processor ?? "") + items.join(" "), caseBits),
    start: prefix === null ? startItems : [prefix, ...startItems],
    end,
  }))
  .filter((c) => !readsAsCardNumber(c));

/** Only the card, POS and debit prefixes, masked card numbers and dates, as `start` and `end`. */
export const decorationArb: fc.Arbitrary<Pick<UnidentifiedCase, "start" | "end">> = fc
  .record({
    prefix: fc.option(prefixArb, { nil: null }),
    startItems: fc.array(fc.oneof(maskedCardArb, dateArb), { maxLength: 2 }),
    end: fc.array(fc.oneof(maskedCardArb, dateArb), { maxLength: 2 }),
  })
  .map(({ prefix, startItems, end }) => ({
    start: prefix === null ? startItems : [prefix, ...startItems],
    end,
  }));

// ---------------------------------------------------------------------------------------------
// adversarialCorpus
// ---------------------------------------------------------------------------------------------

/** One adversarial input: a label for failure messages and a text of exactly CORPUS_LENGTH. */
export interface AdversarialInput {
  label: string;
  text: string;
}

export const CORPUS_LENGTH = 10_000;

/** `unit` repeated and cut to exactly `length` characters. */
function repeatTo(unit: string, length: number): string {
  return unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
}

/** Fixed seed: the random-case copies are the same on every run, so a slow input can be replayed. */
const CORPUS_SEED = 20_260_312;

const BASE_CORPUS: readonly AdversarialInput[] = [
  { label: '"1" x 10000', text: repeatTo("1", CORPUS_LENGTH) },
  { label: '"*" x 10000', text: repeatTo("*", CORPUS_LENGTH) },
  { label: '"12/" repeated', text: repeatTo("12/", CORPUS_LENGTH) },
  { label: '"12/12/" repeated', text: repeatTo("12/12/", CORPUS_LENGTH) },
  { label: '"01." repeated', text: repeatTo("01.", CORPUS_LENGTH) },
  { label: '"1-" repeated', text: repeatTo("1-", CORPUS_LENGTH) },
  { label: '"(1) " repeated', text: repeatTo("(1) ", CORPUS_LENGTH) },
  { label: '"POS " repeated', text: repeatTo("POS ", CORPUS_LENGTH) },
  { label: '"PAYPAL *" repeated', text: repeatTo("PAYPAL *", CORPUS_LENGTH) },
  { label: '"AMZN MKTP " repeated', text: repeatTo("AMZN MKTP ", CORPUS_LENGTH) },
  { label: '"a." repeated + "com"', text: repeatTo("a.", CORPUS_LENGTH - 3) + "com" },
  // A date inside a phone number, repeated: dates and phones unlock each other across passes.
  { label: "phone/date alternation", text: repeatTo("866 12/03 579 12/03 7172 ", CORPUS_LENGTH) },
  // `12 <phone> JAN` needs a second pass: the phone must go before `12 JAN` is contiguous.
  { label: "date around phone, flat", text: repeatTo("12 866-579-7172 JAN ", CORPUS_LENGTH) },
  // The same shape nested 500 deep: each pass can only peel the innermost layer.
  {
    label: "date around phone, nested",
    text: repeatTo("12 866-579-7172 ".repeat(500) + "JAN ".repeat(500), CORPUS_LENGTH),
  },
  { label: "reference between dates", text: repeatTo("12 0412 JAN ", CORPUS_LENGTH) },
];

function randomCaseCopy(input: AdversarialInput, bits: readonly boolean[]): AdversarialInput {
  return { label: `${input.label}, random case`, text: applyCase(input.text, bits) };
}

/**
 * Every adversarial string of design "Generators" at exactly 10,000 characters, plus a random-case
 * copy of each.
 */
export const adversarialCorpus: readonly AdversarialInput[] = Object.freeze([
  ...BASE_CORPUS,
  ...BASE_CORPUS.map((input, index) =>
    randomCaseCopy(
      input,
      fc.sample(fc.array(fc.boolean(), { minLength: 1, maxLength: 12 }), {
        numRuns: 1,
        seed: CORPUS_SEED + index,
      })[0] ?? [true],
    ),
  ),
]);
