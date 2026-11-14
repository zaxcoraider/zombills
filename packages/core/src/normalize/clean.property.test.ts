import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cleanDescription } from "./clean.js";
import { joinTokens } from "./lex.js";
import { CARD_PREFIXES, LOCATION_CODES, MONTHS, PROCESSOR_FORMS, TLDS } from "./noise-lists.js";

const SEPARATORS = [" ", "  ", "*", " *", "* ", "/", "_", "#", "-", ".", "(", ") ", "+", "://"];

const separatorArb = fc.constantFrom(...SEPARATORS);

const noiseWordArb = fc.oneof(
  fc.constantFrom(...CARD_PREFIXES.flat()),
  fc.constantFrom(...PROCESSOR_FORMS.flatMap((form) => form.tokens)),
  fc.constantFrom(...LOCATION_CODES),
  fc.constantFrom(...MONTHS),
  fc.constantFrom(...TLDS),
  fc.constantFrom("store", "no", "nr", "card", "ending", "www", "http", "https", "com"),
  fc.stringMatching(/^[0-9]{1,16}$/u),
  fc.stringMatching(/^[x*]{2,4}[0-9]{4}$/u),
  fc.stringMatching(/^[0-9]{1,2}[-./][0-9]{1,2}$/u),
  fc.stringMatching(/^[a-z0-9]{1,10}$/u),
);

/** A string built from noise-list words joined by the separators the rules look at. */
const noiseListStringArb = fc
  .array(fc.tuple(separatorArb, noiseWordArb, fc.boolean()), { minLength: 0, maxLength: 12 })
  .map((parts) =>
    parts
      .map(([separator, word, upper]) => separator + (upper ? word.toUpperCase() : word))
      .join(""),
  );

function fixedPoint(description: string): void {
  const first = cleanDescription(description).cleaned;
  const second = cleanDescription(joinTokens(first, "raw")).cleaned;
  expect(second.map((token) => [token.raw, token.folded])).toEqual(
    first.map((token) => [token.raw, token.folded]),
  );
}

describe("cleanup properties", () => {
  it("P6: cleanup fixed point, arbitrary strings", () => {
    fc.assert(fc.property(fc.string({ maxLength: 60 }), fixedPoint));
    fc.assert(fc.property(fc.string({ unit: "binary", maxLength: 60 }), fixedPoint));
  });

  it("P6: cleanup fixed point, strings built from the noise lists", () => {
    fc.assert(fc.property(noiseListStringArb, fixedPoint), { numRuns: 1000 });
  });
});
