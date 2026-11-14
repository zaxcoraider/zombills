import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseStatement } from "../parse/parse-statement.js";
import { normalizeMerchant } from "./normalize-merchant.js";
import { normalizeTransactions } from "./normalize-transactions.js";
import type { NormalizedTransaction } from "./types.js";

const EU_SAMPLE = fileURLToPath(new URL("../../../../samples/eu-semicolon.csv", import.meta.url));

/** The Req 7.1 table. */
const EXPECTED: readonly (readonly [string, string, string])[] = [
  ["GEHALT BEISPIEL GMBH", "merchant:gehalt-beispiel-gmbh", "Gehalt Beispiel Gmbh"],
  [
    "STREAMING DIENST MONATSBEITRAG",
    "merchant:streaming-dienst-monatsbeitrag",
    "Streaming Dienst Monatsbeitrag",
  ],
  ["SUPERMARKT NORD 0412", "merchant:supermarkt-nord", "Supermarkt Nord"],
  ["MUSIKDIENST PREMIUM", "merchant:musikdienst-premium", "Musikdienst Premium"],
  ["FITNESSSTUDIO LINDENHOF", "merchant:fitnessstudio-lindenhof", "Fitnessstudio Lindenhof"],
  ["TANKSTELLE AM RING", "merchant:tankstelle-am-ring", "Tankstelle Am Ring"],
  [
    "ONLINE SHOP RUECKERSTATTUNG",
    "merchant:online-shop-rueckerstattung",
    "Online Shop Rueckerstattung",
  ],
];

function loadSample(): NormalizedTransaction[] {
  const result = parseStatement(readFileSync(EU_SAMPLE, "utf8"));
  if (result.status !== "mapped") throw new Error(`EU sample did not parse: ${result.status}`);
  return normalizeTransactions(result.transactions);
}

describe("the EU sample statement (Req 7.1, 7.2)", () => {
  const normalized = loadSample();

  it("normalizes every description as the Req 7.1 table says", () => {
    expect(normalized.length).toBeGreaterThan(0);
    const byDescription = new Map(
      EXPECTED.map(([description, key, name]) => [description, [key, name]]),
    );
    for (const row of normalized) {
      const expected = byDescription.get(row.description);
      expect(expected, row.description).toBeDefined();
      expect(row.merchant.source, row.description).toBe("generic");
      expect(row.merchant.serviceId, row.description).toBeNull();
      expect([row.merchant.key, row.merchant.displayName], row.description).toEqual(expected);
    }
    for (const [description] of EXPECTED) {
      expect(
        normalized.some((row) => row.description === description),
        description,
      ).toBe(true);
    }
  });

  it("yields exactly 7 distinct keys", () => {
    expect(new Set(normalized.map((row) => row.merchant.key)).size).toBe(7);
  });

  it("maps no row to a Known service", () => {
    expect(normalized.filter((row) => row.merchant.source === "known")).toEqual([]);
  });
});

describe("European descriptions (Req 7.3 to 7.5)", () => {
  it("maps SEPA-LASTSCHRIFT SPOTIFY AB to spotify", () => {
    expect(normalizeMerchant("SEPA-LASTSCHRIFT SPOTIFY AB").key).toBe("spotify");
  });

  it("maps KARTENZAHLUNG 03.01. NETFLIX to netflix", () => {
    expect(normalizeMerchant("KARTENZAHLUNG 03.01. NETFLIX").key).toBe("netflix");
  });

  it("treats accented and unaccented spellings as equal but not transliterations", () => {
    const umlaut = normalizeMerchant("RÜCKERSTATTUNG").key;
    expect(normalizeMerchant("RUCKERSTATTUNG").key).toBe(umlaut);
    expect(normalizeMerchant("RUECKERSTATTUNG").key).not.toBe(umlaut);
  });

  it("treats ß and SS as equal", () => {
    expect(normalizeMerchant("STRAßE").key).toBe(normalizeMerchant("STRASSE").key);
  });
});
