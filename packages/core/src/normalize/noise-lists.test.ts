import { describe, expect, it } from "vitest";
import {
  CA_PROVINCE_CODES,
  CARD_PREFIXES,
  ISO_COUNTRY_CODES,
  LOCATION_CODES,
  MONTHS,
  PROCESSOR_FORMS,
  PROCESSOR_NAMES,
  TLDS,
  US_STATE_CODES,
} from "./noise-lists.js";

/** Every entry of Req 3.2, as written there. `SEPA-LASTSCHRIFT` is one token. */
const REQ_3_2_PREFIXES = [
  "POS",
  "POS PURCHASE",
  "POS DEBIT",
  "PURCHASE",
  "CARD PURCHASE",
  "DEBIT CARD PURCHASE",
  "DEBIT CARD",
  "DEBIT",
  "VISA",
  "VISA PURCHASE",
  "VISA DEBIT",
  "MASTERCARD",
  "CHECKCARD",
  "CHECK CARD",
  "RECURRING",
  "RECURRING PAYMENT",
  "RECURRING DEBIT",
  "ACH",
  "ACH DEBIT",
  "DD",
  "DIRECT DEBIT",
  "SEPA DIRECT DEBIT",
  "CONTACTLESS",
  "KARTENZAHLUNG",
  "LASTSCHRIFT",
  "SEPA LASTSCHRIFT",
  "SEPA-LASTSCHRIFT",
  "PRELEVEMENT",
];

function isFrozen(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(isFrozen);
}

describe("CARD_PREFIXES", () => {
  const asText = CARD_PREFIXES.map((tokens) => tokens.join(" "));

  it("contains every Req 3.2 entry, folded, and nothing else", () => {
    expect([...asText].sort()).toEqual(REQ_3_2_PREFIXES.map((p) => p.toLowerCase()).sort());
  });

  it("is sorted by token count, longest first", () => {
    const counts = CARD_PREFIXES.map((tokens) => tokens.length);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it("has no duplicates", () => {
    expect(new Set(asText).size).toBe(asText.length);
  });

  it("keeps sepa-lastschrift as one token", () => {
    expect(CARD_PREFIXES).toContainEqual(["sepa-lastschrift"]);
  });
});

describe("location code lists", () => {
  it("ISO_COUNTRY_CODES has 249 unique two-letter codes", () => {
    expect(ISO_COUNTRY_CODES).toHaveLength(249);
    expect(new Set(ISO_COUNTRY_CODES).size).toBe(249);
    for (const code of ISO_COUNTRY_CODES) expect(code).toMatch(/^[a-z]{2}$/u);
  });

  it("US_STATE_CODES has 50 states plus DC, PR, GU, VI, AS, MP, all unique", () => {
    expect(US_STATE_CODES).toHaveLength(56);
    expect(new Set(US_STATE_CODES).size).toBe(56);
    for (const code of ["dc", "pr", "gu", "vi", "as", "mp"]) expect(US_STATE_CODES).toContain(code);
  });

  it("CA_PROVINCE_CODES has 13 unique codes", () => {
    expect(CA_PROVINCE_CODES).toHaveLength(13);
    expect(new Set(CA_PROVINCE_CODES).size).toBe(13);
  });

  it("LOCATION_CODES is the de-duplicated union plus usa", () => {
    const union = new Set([...US_STATE_CODES, ...CA_PROVINCE_CODES, ...ISO_COUNTRY_CODES, "usa"]);
    expect(LOCATION_CODES).toHaveLength(union.size);
    expect(new Set(LOCATION_CODES)).toEqual(union);
  });

  it('contains "am" (Armenia, and a first name), so only trailing use is safe', () => {
    expect(LOCATION_CODES).toContain("am");
  });

  it("is folded (lower case)", () => {
    for (const code of LOCATION_CODES) expect(code).toBe(code.toLowerCase());
  });
});

describe("other lists", () => {
  it("MONTHS has the 12 English abbreviations", () => {
    expect(MONTHS).toEqual([
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ]);
  });

  it("TLDS has the extra codes from the task and no duplicates", () => {
    for (const tld of ["com", "ca", "au", "ch", "at", "se", "ie", "be", "info"]) {
      expect(TLDS).toContain(tld);
    }
    expect(new Set(TLDS).size).toBe(TLDS.length);
  });

  it("PROCESSOR_NAMES has a name for every processor in PROCESSOR_FORMS", () => {
    for (const form of PROCESSOR_FORMS) expect(PROCESSOR_NAMES[form.processor]).toBeTruthy();
  });

  it("PROCESSOR_FORMS only lists `*` forms for single tokens that are not merchant words", () => {
    const needsStar = PROCESSOR_FORMS.filter((f) => f.after !== "none");
    expect(needsStar.length).toBeGreaterThan(0);
    for (const form of needsStar) expect(form.tokens).toHaveLength(1);
  });
});

describe("freezing", () => {
  it.each([
    ["CARD_PREFIXES", CARD_PREFIXES],
    ["MONTHS", MONTHS],
    ["TLDS", TLDS],
    ["US_STATE_CODES", US_STATE_CODES],
    ["CA_PROVINCE_CODES", CA_PROVINCE_CODES],
    ["ISO_COUNTRY_CODES", ISO_COUNTRY_CODES],
    ["LOCATION_CODES", LOCATION_CODES],
    ["PROCESSOR_FORMS", PROCESSOR_FORMS],
    ["PROCESSOR_NAMES", PROCESSOR_NAMES],
  ])("%s is deeply frozen", (_name, value) => {
    expect(isFrozen(value)).toBe(true);
  });
});
