import fc from "fast-check";
import type { Cadence } from "../detect/types.js";
import { KNOWN_SERVICES } from "../normalize/known-services.js";
import { CANCEL_ENTRIES } from "./cancel-data.js";
import type { EmailInput } from "./types.js";

/** Pieces that are hard for the cleaner, the template and the encoder. */
const HARD_PIECES: readonly string[] = [
  "\n",
  "\r\n",
  "\t",
  "\u0000",
  "\u007F",
  "\u0085",
  "\u2028",
  "\u2029",
  "\u00AD",
  "\u200B",
  "\u202E",
  "\u2066",
  "\uFEFF",
  "\uD800",
  "\uDC00",
  "😀",
  "[",
  "]",
  "[Your name]",
  "[Your account email]",
  "%",
  "&",
  "?",
  "#",
  "=",
  "$&",
  "Please",
  "subscription",
  " ",
  "Netflix",
];

const hardPieceArb = fc.oneof(
  fc.constantFrom(...HARD_PIECES),
  fc.stringMatching(/^[0-9]{1,12}$/),
  fc.integer({ min: 1, max: 12 }).map((n) => " ".repeat(n)),
);

/** A string built from hard pieces. */
const piecesArb = fc.array(hardPieceArb, { minLength: 0, maxLength: 12 }).map((a) => a.join(""));

/** More than 80 code points, with hard pieces mixed in. */
const longArb = fc
  .tuple(
    fc.integer({ min: 70, max: 120 }),
    fc.constantFrom("a", "é", "😀", "x y", "\u200B"),
    piecesArb,
  )
  .map(([n, unit, tail]) => unit.repeat(n) + tail);

export const nastyStringArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: fc.string({ unit: "binary", maxLength: 40 }) },
  { weight: 4, arbitrary: piecesArb },
  { weight: 1, arbitrary: longArb },
  { weight: 1, arbitrary: fc.string({ maxLength: 20 }) },
);

/** Invalid cadences are not of type Cadence; they go through unknown on purpose, to test a bad caller. */
const INVALID_CADENCES: readonly unknown[] = ["daily", "", "constructor", "__proto__"];

export const cadenceArb: fc.Arbitrary<Cadence> = fc.oneof(
  fc.constantFrom<Cadence>("weekly", "monthly", "yearly"),
  fc.constantFrom(...INVALID_CADENCES).map((c) => c as Cadence),
);

export const currencyArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom("USD", "GBP", "EUR", "JPY"),
  fc.constantFrom("usd", " USD", "US", "USDX", ""),
  nastyStringArb,
);

const nameAndAmountArb: fc.Arbitrary<readonly [string, string]> = fc.oneof(
  fc.tuple(nastyStringArb, nastyStringArb),
  nastyStringArb.map((s): readonly [string, string] => [s, s]),
  nastyStringArb.map((s): readonly [string, string] => ["", s]),
  fc.constantFrom<readonly [string, string]>(["Please", "Please"], ["Please", ""], ["", ""]),
);

export const emailInputArb: fc.Arbitrary<EmailInput> = fc
  .record({
    names: nameAndAmountArb,
    cadence: cadenceArb,
    cadenceAssumed: fc.boolean(),
    currency: currencyArb,
  })
  .map(({ names, cadence, cadenceAssumed, currency }) => ({
    serviceName: names[0],
    amountText: names[1],
    currency,
    cadence,
    cadenceAssumed,
  }));

/** An Email input plus extra properties the generator must ignore. */
export const emailInputWithExtrasArb: fc.Arbitrary<{
  readonly input: EmailInput;
  readonly extras: Readonly<Record<string, string>>;
  readonly withExtras: EmailInput & {
    readonly name: string;
    readonly email: string;
    readonly cardNumber: string;
    readonly description: string;
  };
}> = fc
  .record({
    input: emailInputArb,
    name: nastyStringArb,
    email: nastyStringArb,
    cardNumber: nastyStringArb,
    description: nastyStringArb,
  })
  .map(({ input, ...extras }) => ({
    input,
    extras,
    withExtras: { ...extras, ...input },
  }));

const LABEL_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789-".split("");
const labelArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...LABEL_CHARS), { minLength: 1, maxLength: 8 })
  .map((chars) => chars.join(""));

/** Domains of 2 to 4 labels from `[a-z0-9-]`. */
export const domainArb: fc.Arbitrary<string> = fc
  .array(labelArb, { minLength: 2, maxLength: 4 })
  .map((labels) => labels.join("."));

/**
 * Hosts for a given domain: the domain itself, a label added in front, the domain with a prefix
 * and no dot, a host that shares only the last label, and an unrelated host.
 */
export function hostArb(domain: string): fc.Arbitrary<string> {
  const lastLabel = domain.slice(domain.lastIndexOf(".") + 1);
  return fc.oneof(
    fc.constant(domain),
    labelArb.map((label) => label + "." + domain),
    fc.constant("not" + domain),
    labelArb.map((label) => label + "." + lastLabel),
    domainArb,
  );
}

const KNOWN_IDS: readonly string[] = KNOWN_SERVICES.map((s) => s.serviceId);

/** Case and space variants of a Known id. */
const variantArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(...KNOWN_IDS),
    fc.constantFrom<(id: string) => string>(
      (id) => id.toUpperCase(),
      (id) => id.charAt(0).toUpperCase() + id.slice(1),
      (id) => " " + id,
      (id) => id + " ",
      (id) => id + "\n",
    ),
  )
  .map(([id, change]) => change(id));

/** Service ids for the lookup: absent, real, Known, prototype keys, variants, merchant keys, noise. */
export const serviceIdArb: fc.Arbitrary<string | null> = fc.oneof(
  fc.constant(null),
  fc.constantFrom(...CANCEL_ENTRIES.map((e) => e.serviceId)),
  fc.constantFrom(...KNOWN_IDS),
  fc.constantFrom("constructor", "__proto__", "toString", "hasOwnProperty", ""),
  variantArb,
  fc.stringMatching(/^[a-z0-9-]{1,20}$/).map((slug) => "merchant:" + slug),
  fc.string(),
);
