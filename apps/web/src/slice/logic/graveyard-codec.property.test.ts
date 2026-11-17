import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CADENCE_FACTOR, savingsTotals } from "./graveyard";
import {
  decodeStore,
  encodeGraveyard,
  parseStoredRecord,
  type ReadResult,
} from "./graveyard-codec";
import { deepFreeze, pageGraveyardArb, pageRecordArb, storedRecordArb } from "./test-arbitraries";

/** Parses the input the way `decodeStore` sees it; only called when the result is `ok`. */
function inputRecords(text: string): readonly unknown[] {
  const root: unknown = JSON.parse(text);
  // An `ok` result means the root is a plain object whose `records` is an array.
  return (root as { records: readonly unknown[] }).records;
}

/** P2 checks that hold for any input text. */
function checkDecode(text: string): ReadResult {
  const result = decodeStore(text);
  if (result.kind !== "ok") return result;
  const records = inputRecords(text);
  const ids = new Set<string>();
  for (const record of result.graveyard) {
    expect(Object.getPrototypeOf(record)).toBe(Object.prototype);
    expect(ids.has(record.id)).toBe(false);
    ids.add(record.id);
    expect(records.some((element) => isSameRecord(parseStoredRecord(element), record))).toBe(true);
  }
  expect(result.graveyard.length).toBeLessThanOrEqual(records.length);
  expect(result.dropped).toBe(records.length - result.graveyard.length);
  expect(() => savingsTotals(result.graveyard)).not.toThrow();
  return result;
}

function isSameRecord(a: unknown, b: unknown): boolean {
  try {
    expect(a).toStrictEqual(b);
    return true;
  } catch {
    return false;
  }
}

const STORED_FIELD_NAMES = [
  "id",
  "merchant",
  "serviceId",
  "currentAmountCents",
  "answer",
  "cadenceAssumed",
  "carriedOver",
] as const;

type Mutation =
  | { kind: "replace"; field: (typeof STORED_FIELD_NAMES)[number]; value: unknown }
  | { kind: "remove"; field: (typeof STORED_FIELD_NAMES)[number] }
  | { kind: "proto" };

const mutationArb: fc.Arbitrary<Mutation> = fc.oneof(
  fc.record({
    kind: fc.constant("replace" as const),
    field: fc.constantFrom(...STORED_FIELD_NAMES),
    value: fc.jsonValue(),
  }),
  fc.record({
    kind: fc.constant("remove" as const),
    field: fc.constantFrom(...STORED_FIELD_NAMES),
  }),
  fc.constant<Mutation>({ kind: "proto" }),
);

/** The Store text with one record changed; `__proto__` is added to the record's text, not set on an object. */
function mutatedText(storeText: string, index: number, mutation: Mutation): string {
  const root = JSON.parse(storeText) as { version: number; records: Record<string, unknown>[] };
  const target = index % root.records.length;
  const texts = root.records.map((record, i) => {
    if (i !== target) return JSON.stringify(record);
    if (mutation.kind === "proto") {
      return `{"__proto__":{"polluted":true,"carriedOver":1},${JSON.stringify(record).slice(1)}`;
    }
    const copy = { ...record };
    if (mutation.kind === "remove") delete copy[mutation.field];
    else copy[mutation.field] = mutation.value;
    return JSON.stringify(copy);
  });
  return `{"version":${root.version},"records":[${texts.join(",")}]}`;
}

describe("graveyard-codec properties", () => {
  it("P1: decode(encode(g)) gives g back", () => {
    fc.assert(
      fc.property(pageGraveyardArb, (g) => {
        deepFreeze(g);
        const encoded = encodeGraveyard(g);
        expect(encoded.leftOut).toBe(0);
        const result = decodeStore(encoded.text);
        expect(result).toStrictEqual({ kind: "ok", graveyard: g, dropped: 0 });
      }),
    );
  });

  it("P1: encode leaves out no record from 200 pageRecordArb samples", () => {
    for (const record of fc.sample(pageRecordArb, 200)) {
      expect(encodeGraveyard([record]).leftOut).toBe(0);
    }
  });

  it("P2: decode never throws for any string", () => {
    fc.assert(fc.property(fc.string(), (text) => void checkDecode(text)));
  });

  it("P2: decode never throws for any JSON value", () => {
    fc.assert(fc.property(fc.jsonValue(), (value) => void checkDecode(JSON.stringify(value))));
  });

  it("P2: decode never throws for an encoded graveyard with one record field changed", () => {
    fc.assert(
      fc.property(
        pageGraveyardArb.filter((g) => g.length > 0),
        fc.nat(),
        mutationArb,
        (g, index, mutation) => {
          const text = mutatedText(encodeGraveyard(g).text, index, mutation);
          const result = checkDecode(text);
          // Whatever the change, the Store itself stays readable.
          expect(result.kind).toBe("ok");
        },
      ),
    );
  });

  it("P3: currency, cadence and yearlySavingCents come from the id and the stored fields", () => {
    fc.assert(
      fc.property(storedRecordArb, ({ stored, currency, cadence }) => {
        const record = parseStoredRecord(stored);
        expect(record).not.toBeNull();
        if (record === null) return;
        expect(record.currency).toBe(currency);
        expect(record.cadence).toBe(cadence);
        expect(record.yearlySavingCents).toBe(
          stored.cadenceAssumed ? null : stored.currentAmountCents * CADENCE_FACTOR[cadence],
        );
      }),
    );
  });
});
