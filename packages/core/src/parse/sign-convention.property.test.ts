import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { negate } from "./amount.js";
import { applySignConvention, detectSignConvention } from "./sign-convention.js";
import { parseStatement } from "./parse-statement.js";
import {
  centsArbitrary,
  expectedFromModel,
  parseOptionsOf,
  rawSignedCents,
  renderStatement,
  statementModelArbitrary,
  withFlippedSignConvention,
  withPermutation,
} from "./test-arbitraries.js";
import type { MappedResult, ParseResult, SignConventionInfo } from "./types.js";

// P8 and P18 are checked twice: on the detector alone (first describe) and through parseStatement
// against the statement model (second describe).

const rawValues: fc.Arbitrary<number[]> = fc.array(centsArbitrary, { maxLength: 40 });

function counts(values: readonly number[]): { positive: number; negative: number } {
  return {
    positive: values.filter((value) => value > 0).length,
    negative: values.filter((value) => value < 0).length,
  };
}

describe("sign convention properties", () => {
  it("P18 (detector): negating every value flips the convention, unless the counts are tied", () => {
    fc.assert(
      fc.property(rawValues, (values) => {
        const original = detectSignConvention(values);
        const flipped = detectSignConvention(values.map(negate));
        if (original.assumed) {
          // Equal counts stay equal after negating, so the tie default applies again.
          expect(flipped).toEqual(original);
        } else {
          expect(flipped.assumed).toBe(false);
          expect(flipped.convention).not.toBe(original.convention);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("P18 (detector): negating every raw value leaves the stored amounts unchanged", () => {
    fc.assert(
      fc.property(rawValues, (values) => {
        const original = detectSignConvention(values);
        const flipped = detectSignConvention(values.map(negate));
        fc.pre(!original.assumed);
        const stored = values.map((value) => applySignConvention(value, original.convention));
        const storedAfterFlip = values
          .map(negate)
          .map((value) => applySignConvention(value, flipped.convention));
        expect(storedAfterFlip).toEqual(stored);
      }),
    );
  });

  it("P8 (detector): the detected convention stores most values as money out", () => {
    fc.assert(
      fc.property(rawValues, (values) => {
        const info = detectSignConvention(values);
        const stored = values.map((value) => applySignConvention(value, info.convention));
        const { positive, negative } = counts(stored);
        if (info.assumed) {
          expect(positive).toBe(negative);
        } else {
          expect(positive).toBeGreaterThan(negative);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("detection depends only on the values, not their order", () => {
    fc.assert(
      fc.property(withPermutation(centsArbitrary), ([values, shuffled]) => {
        expect(detectSignConvention(shuffled)).toEqual(detectSignConvention(values));
      }),
    );
  });

  it("zeros never change the detection", () => {
    fc.assert(
      fc.property(rawValues, fc.nat({ max: 10 }), (values, zeros) => {
        expect(
          detectSignConvention([...values, ...Array.from({ length: zeros }, () => 0)]),
        ).toEqual(detectSignConvention(values));
      }),
    );
  });

  it("applySignConvention: negative-out is the negation of positive-out and never gives -0", () => {
    fc.assert(
      fc.property(centsArbitrary, (cents) => {
        const positiveOut = applySignConvention(cents, "positive-out");
        const negativeOut = applySignConvention(cents, "negative-out");
        expect(negativeOut).toBe(negate(positiveOut));
        expect(Object.is(positiveOut, -0)).toBe(false);
        expect(Object.is(negativeOut, -0)).toBe(false);
        expect(Number.isInteger(negativeOut)).toBe(true);
      }),
    );
  });
});

function mapped(result: ParseResult): MappedResult {
  if (result.status !== "mapped") {
    throw new Error(`Expected a mapped result but got ${JSON.stringify(result).slice(0, 300)}`);
  }
  return result;
}

const signOf = (value: number): number => Math.sign(value);

describe("sign convention through parseStatement", () => {
  it("P8: every non-zero amount has the sign that the returned convention gives its written sign (Req 13.8, 6.1, 6.3-6.6)", () => {
    fc.assert(
      fc.property(
        statementModelArbitrary({ layout: "signed-amount", signMode: "any" }),
        (model) => {
          const result = mapped(parseStatement(renderStatement(model), parseOptionsOf(model)));
          const info = result.detectedSignConvention;
          expect(info).not.toBeNull();
          const convention = (info as SignConventionInfo).convention;

          // Each sound row's stored amount follows from the number written in the file.
          const sound = model.rows.filter((row) => row.defect === null);
          expect(result.transactions).toHaveLength(sound.length);
          result.transactions.forEach((transaction, index) => {
            const row = sound[index];
            const written = row === undefined ? 0 : rawSignedCents(row, model.signConvention);
            if (written === 0) {
              expect(Object.is(transaction.amountCents, 0)).toBe(true);
            } else if (convention === "positive-out") {
              expect(signOf(transaction.amountCents)).toBe(signOf(written));
            } else {
              expect(signOf(transaction.amountCents)).toBe(-signOf(written));
            }
            expect(Math.abs(transaction.amountCents)).toBe(Math.abs(written));
          });
          expect(result.transactions).toEqual(expectedFromModel(model, convention).transactions);
        },
      ),
      { numRuns: 400 },
    );
  });

  it("P8: the returned convention is the majority of the non-zero numbers written, a tie being assumed (Req 6.1)", () => {
    fc.assert(
      fc.property(
        statementModelArbitrary({ layout: "signed-amount", signMode: "any" }),
        (model) => {
          const result = mapped(parseStatement(renderStatement(model), parseOptionsOf(model)));
          // Rows whose amount cell is unreadable do not take part, whatever else is wrong with them.
          const written = model.rows
            .filter((row) => row.defect !== "amount-garbage")
            .map((row) => rawSignedCents(row, model.signConvention))
            .filter((value) => value !== 0);
          const positive = written.filter((value) => value > 0).length;
          const negative = written.length - positive;
          const expected: SignConventionInfo =
            positive > negative
              ? { convention: "positive-out", assumed: false }
              : negative > positive
                ? { convention: "negative-out", assumed: false }
                : { convention: "positive-out", assumed: true };
          expect(result.detectedSignConvention).toEqual(expected);
        },
      ),
      { numRuns: 400 },
    );
  });

  it("P8: an explicit convention is used as given and never reported as assumed (Req 6.2)", () => {
    fc.assert(
      fc.property(
        statementModelArbitrary({ layout: "signed-amount", signMode: "explicit" }),
        (model) => {
          const result = mapped(parseStatement(renderStatement(model), parseOptionsOf(model)));
          expect(result.detectedSignConvention).toEqual({
            convention: model.signConvention,
            assumed: false,
          });
          expect(result.transactions).toEqual(expectedFromModel(model).transactions);
        },
      ),
    );
  });

  it("P18: writing every amount with the opposite sign flips the detected convention and keeps the transactions (Req 6.1)", () => {
    fc.assert(
      fc.property(
        statementModelArbitrary({ layout: "signed-amount", signMode: "majority" }),
        (model) => {
          const original = mapped(parseStatement(renderStatement(model), parseOptionsOf(model)));
          const flippedModel = withFlippedSignConvention(model);
          const flipped = mapped(
            parseStatement(renderStatement(flippedModel), parseOptionsOf(flippedModel)),
          );

          expect(flipped.transactions).toEqual(original.transactions);
          expect(flipped.rowErrors.map((e) => e.rowIndex)).toEqual(
            original.rowErrors.map((e) => e.rowIndex),
          );

          const decidable = model.rows.some(
            (row) => row.cents > 0 && row.defect !== "amount-garbage",
          );
          if (decidable) {
            expect(original.detectedSignConvention).toEqual({
              convention: model.signConvention,
              assumed: false,
            });
            expect(flipped.detectedSignConvention).toEqual({
              convention: flippedModel.signConvention,
              assumed: false,
            });
          } else {
            // No non-zero amount to go by: both are the assumed default, and nothing is flipped.
            expect(original.detectedSignConvention).toEqual({
              convention: "positive-out",
              assumed: true,
            });
            expect(flipped.detectedSignConvention).toEqual(original.detectedSignConvention);
          }
        },
      ),
      { numRuns: 400 },
    );
  });

  it("P18: the debit/credit layout has no sign convention, whatever the options say (Req 7)", () => {
    fc.assert(
      fc.property(statementModelArbitrary({ layout: "debit-credit" }), (model) => {
        const result = mapped(parseStatement(renderStatement(model), parseOptionsOf(model)));
        expect(result.detectedSignConvention).toBeNull();
        expect(result.transactions).toEqual(expectedFromModel(model).transactions);
      }),
    );
  });
});
