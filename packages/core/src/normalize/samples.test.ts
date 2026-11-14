import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseStatement } from "../parse/parse-statement.js";
import { normalizeTransactions } from "./normalize-transactions.js";
import type { MerchantIdentity } from "./types.js";

const SAMPLE_FILES = [
  "us-signed.csv",
  "uk-debit-credit.csv",
  "eu-semicolon.csv",
  "with-preamble.csv",
] as const;

/** The sorted distinct merchant identities of one sample statement. */
function distinctMerchants(file: string): MerchantIdentity[] {
  const path = fileURLToPath(new URL(`../../../../samples/${file}`, import.meta.url));
  const result = parseStatement(readFileSync(path, "utf8"));
  if (result.status !== "mapped") throw new Error(`${file} did not parse: ${result.status}`);
  const byKey = new Map<string, MerchantIdentity>();
  for (const row of normalizeTransactions(result.transactions)) {
    const { key, displayName, source, serviceId, processor } = row.merchant;
    byKey.set(JSON.stringify([key, displayName, source, serviceId, processor]), {
      key,
      displayName,
      source,
      serviceId,
      processor,
    });
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, identity]) => identity);
}

describe("sample statements, normalized", () => {
  for (const file of SAMPLE_FILES) {
    it(`${file}: distinct merchant identities`, () => {
      expect(distinctMerchants(file)).toMatchSnapshot();
    });
  }
});
