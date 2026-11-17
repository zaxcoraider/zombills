import { describe, expect, it } from "vitest";
import {
  MAX_DECODED_TEXT_UNITS,
  MAX_ENCODED_TEXT_UNITS,
  decodeStore,
  encodeGraveyard,
  parseStoredRecord,
  parseSubscriptionId,
} from "./graveyard-codec";
import type { AnswerRecord } from "./graveyard";

const NETFLIX = {
  id: "sub:USD:monthly:*:netflix",
  merchant: "Netflix",
  serviceId: "netflix",
  currentAmountCents: 1799,
  answer: "not-using",
  cadenceAssumed: false,
  carriedOver: false,
};

const GLOSSARY_JSON =
  '{"version":1,"records":[{"id":"sub:USD:monthly:*:netflix","merchant":"Netflix","serviceId":"netflix","currentAmountCents":1799,"answer":"not-using","cadenceAssumed":false,"carriedOver":false}]}';

const NETFLIX_RECORD: AnswerRecord = {
  id: "sub:USD:monthly:*:netflix",
  merchant: "Netflix",
  serviceId: "netflix",
  currency: "USD",
  cadence: "monthly",
  currentAmountCents: 1799,
  answer: "not-using",
  cadenceAssumed: false,
  carriedOver: false,
  yearlySavingCents: 21588,
};

function storeOf(...records: unknown[]): string {
  return JSON.stringify({ version: 1, records });
}

describe("parseStoredRecord: the Req 2.6 table", () => {
  it("accepts the Glossary example", () => {
    expect(parseStoredRecord(NETFLIX)).toEqual(NETFLIX_RECORD);
  });

  it("accepts an unidentified id whose merchantKey holds colons", () => {
    const id = "sub:USD:monthly:1099:unidentified:apple:apple.com/bill 866-712-7753 ca";
    const record = parseStoredRecord({ ...NETFLIX, id, currentAmountCents: 1099 });
    expect(record).not.toBeNull();
    expect(parseSubscriptionId(id)?.merchantKey).toBe(
      "unidentified:apple:apple.com/bill 866-712-7753 ca",
    );
  });

  it("rejects a discriminator that does not match the amount", () => {
    expect(parseStoredRecord({ ...NETFLIX, id: "sub:USD:monthly:1199:netflix" })).toBeNull();
  });

  it("rejects a lower-case currency", () => {
    expect(parseStoredRecord({ ...NETFLIX, id: "sub:usd:monthly:*:netflix" })).toBeNull();
  });

  it("gives a null saving when the cadence is assumed", () => {
    expect(parseStoredRecord({ ...NETFLIX, cadenceAssumed: true })).toMatchObject({
      yearlySavingCents: null,
    });
  });

  it("rejects a non-integer amount", () => {
    expect(parseStoredRecord({ ...NETFLIX, currentAmountCents: 17.99 })).toBeNull();
  });

  it("ignores an extra yearlySavingCents field", () => {
    expect(parseStoredRecord({ ...NETFLIX, yearlySavingCents: 99999 })?.yearlySavingCents).toBe(
      21588,
    );
  });

  it("keeps an unknown serviceId as stored", () => {
    expect(parseStoredRecord({ ...NETFLIX, serviceId: "no-such-service" })?.serviceId).toBe(
      "no-such-service",
    );
  });

  it("rejects an amount above 999_999_9900 and accepts the limit", () => {
    expect(parseStoredRecord({ ...NETFLIX, currentAmountCents: 9_999_999_901 })).toBeNull();
    expect(parseStoredRecord({ ...NETFLIX, currentAmountCents: 9_999_999_900 })).not.toBeNull();
    expect(parseStoredRecord({ ...NETFLIX, currentAmountCents: 0 })).toBeNull();
  });

  it("rejects a missing field, a wrong type and non-objects", () => {
    const missing: Record<string, unknown> = { ...NETFLIX };
    delete missing["carriedOver"];
    expect(parseStoredRecord(missing)).toBeNull();
    expect(parseStoredRecord({ ...NETFLIX, merchant: "" })).toBeNull();
    expect(parseStoredRecord({ ...NETFLIX, serviceId: "" })).toBeNull();
    expect(parseStoredRecord({ ...NETFLIX, answer: "maybe" })).toBeNull();
    expect(parseStoredRecord({ ...NETFLIX, carriedOver: "no" })).toBeNull();
    expect(parseStoredRecord(null)).toBeNull();
    expect(parseStoredRecord([])).toBeNull();
    expect(parseStoredRecord("x")).toBeNull();
  });
});

describe("discriminator and key handling", () => {
  it("rejects a leading zero and accepts a -2 suffix", () => {
    const base = { ...NETFLIX, currentAmountCents: 1099 };
    expect(parseStoredRecord({ ...base, id: "sub:USD:monthly:01099:netflix" })).toBeNull();
    expect(parseStoredRecord({ ...base, id: "sub:USD:monthly:1099-2:netflix" })).not.toBeNull();
  });

  it("accepts a merchantKey with a line break", () => {
    expect(parseStoredRecord({ ...NETFLIX, id: "sub:USD:monthly:*:net\nflix" })).not.toBeNull();
  });
});

describe("encodeGraveyard", () => {
  it("encodes the Glossary example to exactly the Glossary JSON", () => {
    expect(encodeGraveyard([NETFLIX_RECORD])).toEqual({ text: GLOSSARY_JSON, leftOut: 0 });
  });

  it("writes an empty Graveyard", () => {
    expect(encodeGraveyard([])).toEqual({ text: '{"version":1,"records":[]}', leftOut: 0 });
  });

  it("leaves out a record whose currency disagrees with its id", () => {
    const bad: AnswerRecord = { ...NETFLIX_RECORD, currency: "EUR" };
    expect(encodeGraveyard([bad, NETFLIX_RECORD])).toEqual({ text: GLOSSARY_JSON, leftOut: 1 });
  });

  it("leaves out a record whose id is 4,097 units, and decode accepts it", () => {
    const key = "x".repeat(MAX_ENCODED_TEXT_UNITS + 1 - "sub:USD:monthly:*:".length);
    const long: AnswerRecord = { ...NETFLIX_RECORD, id: `sub:USD:monthly:*:${key}` };
    expect(long.id.length).toBe(4097);
    expect(encodeGraveyard([long])).toEqual({ text: '{"version":1,"records":[]}', leftOut: 1 });
    const decoded = decodeStore(storeOf({ ...NETFLIX, id: long.id }));
    expect(decoded).toMatchObject({ kind: "ok", dropped: 0 });
  });

  it("leaves out a merchant of 4,097 units and keeps one of 4,096", () => {
    const tooLong: AnswerRecord = { ...NETFLIX_RECORD, merchant: "m".repeat(4097) };
    const fits: AnswerRecord = { ...NETFLIX_RECORD, merchant: "m".repeat(4096) };
    expect(encodeGraveyard([tooLong]).leftOut).toBe(1);
    expect(encodeGraveyard([fits]).leftOut).toBe(0);
  });

  it("keeps the first record of a repeated id and at most 1,000 records", () => {
    const second: AnswerRecord = { ...NETFLIX_RECORD, merchant: "Other" };
    expect(encodeGraveyard([NETFLIX_RECORD, second])).toEqual({ text: GLOSSARY_JSON, leftOut: 1 });
    const many = Array.from({ length: 1001 }, (_, n) => ({
      ...NETFLIX_RECORD,
      id: `sub:USD:monthly:*:m${String(n)}`,
    }));
    expect(encodeGraveyard(many).leftOut).toBe(1);
  });

  it("counts a record whose getter throws as left out", () => {
    const throwing = { ...NETFLIX_RECORD };
    Object.defineProperty(throwing, "merchant", {
      enumerable: true,
      get() {
        throw new Error("boom");
      },
    });
    expect(encodeGraveyard([throwing])).toEqual({
      text: '{"version":1,"records":[]}',
      leftOut: 1,
    });
  });
});

describe("decodeStore", () => {
  it("reads the Glossary example", () => {
    expect(decodeStore(GLOSSARY_JSON)).toEqual({
      kind: "ok",
      graveyard: [NETFLIX_RECORD],
      dropped: 0,
    });
  });

  it("loads Netflix and drops the invalid record (Req 4.8)", () => {
    expect(decodeStore(storeOf(NETFLIX, { id: "oops" }))).toEqual({
      kind: "ok",
      graveyard: [NETFLIX_RECORD],
      dropped: 1,
    });
  });

  it("returns unreadable for every Req 4.9 input", () => {
    for (const text of [
      "",
      "{",
      "null",
      "[]",
      "1",
      '"x"',
      '{"version":0,"records":[]}',
      '{"version":"1","records":[]}',
      '{"version":1}',
      '{"version":1,"records":{}}',
    ]) {
      expect(decodeStore(text)).toEqual({ kind: "unreadable" });
    }
  });

  it("returns newer for a version above 1, whatever records holds", () => {
    expect(decodeStore('{"version":2,"records":[]}')).toEqual({ kind: "newer" });
    expect(decodeStore('{"version":2,"records":"x"}')).toEqual({ kind: "newer" });
  });

  it("returns empty for null", () => {
    expect(decodeStore(null)).toEqual({ kind: "empty" });
  });

  it("rejects an id of 1,048,577 units and accepts 1,048,576", () => {
    const prefix = "sub:USD:monthly:*:";
    const at = prefix + "x".repeat(MAX_DECODED_TEXT_UNITS - prefix.length);
    expect(decodeStore(storeOf({ ...NETFLIX, id: at }))).toMatchObject({ kind: "ok", dropped: 0 });
    expect(decodeStore(storeOf({ ...NETFLIX, id: at + "x" }))).toMatchObject({
      kind: "ok",
      dropped: 1,
    });
  });

  it("loads 1,000 of 1,001 valid records", () => {
    const records = Array.from({ length: 1001 }, (_, n) => ({
      ...NETFLIX,
      id: `sub:USD:monthly:*:m${String(n)}`,
    }));
    const result = decodeStore(storeOf(...records));
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.graveyard).toHaveLength(1000);
      expect(result.dropped).toBe(1);
    }
  });

  it("keeps the first of duplicate ids", () => {
    const result = decodeStore(storeOf(NETFLIX, { ...NETFLIX, merchant: "Other" }));
    expect(result).toMatchObject({ kind: "ok", dropped: 1 });
    if (result.kind === "ok") expect(result.graveyard[0]?.merchant).toBe("Netflix");
  });

  it("is not changed by __proto__ keys in a record or at the root", () => {
    const inRecord = `{"version":1,"records":[{"__proto__":{"polluted":1},"id":"sub:USD:monthly:*:netflix","merchant":"Netflix","serviceId":null,"currentAmountCents":1799,"answer":"not-using","cadenceAssumed":false,"carriedOver":false}]}`;
    const atRoot = `{"__proto__":{"polluted":1},"version":1,"records":[]}`;
    for (const text of [inRecord, atRoot]) {
      const result = decodeStore(text);
      expect(result.kind).toBe("ok");
      expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
      if (result.kind === "ok") {
        for (const record of result.graveyard) {
          expect(Object.getPrototypeOf(record)).toBe(Object.prototype);
        }
        expect(Object.getPrototypeOf(result.graveyard)).toBe(Array.prototype);
      }
    }
  });

  it("returns unreadable for 10,000-deep nesting without throwing", () => {
    const deep = "[".repeat(10_000);
    expect(decodeStore(deep)).toEqual({ kind: "unreadable" });
    expect(decodeStore(deep + "]".repeat(10_000))).toEqual({ kind: "unreadable" });
  });
});
