import { describe, expect, it } from "vitest";
import { charge, credit, zero } from "./test-fixtures.js";
import { validateElement } from "./validate.js";

type Row = Record<string, unknown>;

function base(): Row {
  return { ...charge("2026-01-15", 999, "merchant:gym") };
}

function withMerchant(patch: Row): Row {
  const row = base();
  row.merchant = { ...(row.merchant as Row), ...patch };
  return row;
}

function expectFailure(value: unknown, field: string): void {
  const result = validateElement(value, 0);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.reason.startsWith(field)).toBe(true);
    expect(result.reason.length).toBeGreaterThan(field.length);
  }
}

class Thing {
  date = "2026-01-15";
}

describe("validateElement: check 1, plain object", () => {
  it("rejects non-objects, null, arrays and class instances", () => {
    expectFailure("row", "element");
    expectFailure(42, "element");
    expectFailure(undefined, "element");
    expectFailure(null, "element");
    expectFailure([], "element");
    expectFailure([base()], "element");
    expectFailure(Object.assign(new Thing(), base()), "element");
  });

  it("accepts an object with a null prototype", () => {
    const row = Object.assign(Object.create(null) as Row, base());
    expect(validateElement(row, 3).ok).toBe(true);
  });

  it("accepts a merchant with a null prototype", () => {
    const row = base();
    row.merchant = Object.assign(Object.create(null) as Row, row.merchant);
    expect(validateElement(row, 0).ok).toBe(true);
  });
});

describe("validateElement: checks 2 to 5, transaction fields", () => {
  it("rejects a bad date and names `date`", () => {
    for (const date of ["2026-02-29", "2026-1-1", 20260115, undefined, null]) {
      expectFailure({ ...base(), date }, "date");
    }
    expect(validateElement({ ...base(), date: "2026-02-30" }, 0)).toEqual({
      ok: false,
      reason: "date: not a real calendar date",
    });
  });

  it("rejects a non-string description", () => {
    for (const description of [undefined, null, 5, ["x"]]) {
      expectFailure({ ...base(), description }, "description");
    }
  });

  it("accepts an empty description", () => {
    expect(validateElement({ ...base(), description: "" }, 0).ok).toBe(true);
  });

  it("rejects an amountCents that is not a safe integer", () => {
    for (const amountCents of [1.5, Number.NaN, Infinity, 2 ** 53, -(2 ** 53), "999", null, undefined]) {
      expectFailure({ ...base(), amountCents }, "amountCents");
    }
  });

  it("accepts negative, zero and the largest safe amountCents", () => {
    for (const amountCents of [-999, 0, Number.MAX_SAFE_INTEGER]) {
      expect(validateElement({ ...base(), amountCents }, 0).ok).toBe(true);
    }
  });

  it("rejects a currency that is not three upper-case ASCII letters", () => {
    for (const currency of ["usd", "US", "USDX", "US1", "USD\n", "", 840, undefined]) {
      expectFailure({ ...base(), currency }, "currency");
    }
  });
});

describe("validateElement: check 6, merchant shape", () => {
  it("rejects a missing or non-object merchant", () => {
    const missing = base();
    delete missing.merchant;
    expectFailure(missing, "merchant");
    expectFailure({ ...base(), merchant: null }, "merchant");
    expectFailure({ ...base(), merchant: "gym" }, "merchant");
    expectFailure({ ...base(), merchant: [] }, "merchant");
  });

  it("rejects an empty or non-string key", () => {
    expectFailure(withMerchant({ key: "" }), "merchant.key");
    expectFailure(withMerchant({ key: 5 }), "merchant.key");
  });

  it("rejects an empty or non-string displayName", () => {
    expectFailure(withMerchant({ displayName: "" }), "merchant.displayName");
    expectFailure(withMerchant({ displayName: null }), "merchant.displayName");
  });

  it("rejects an unknown source", () => {
    expectFailure(withMerchant({ source: "other" }), "merchant.source");
    expectFailure(withMerchant({ source: undefined }), "merchant.source");
  });

  it("rejects a serviceId that is not a string or null", () => {
    expectFailure(withMerchant({ serviceId: 7 }), "merchant.serviceId");
    expectFailure(withMerchant({ serviceId: undefined }), "merchant.serviceId");
  });

  it("rejects a processor that is undefined or not a string or null", () => {
    expectFailure(withMerchant({ processor: undefined }), "merchant.processor");
    expectFailure(withMerchant({ processor: 1 }), "merchant.processor");
  });

  it("accepts any string as processor", () => {
    expect(validateElement(withMerchant({ processor: "paypal" }), 0).ok).toBe(true);
  });
});

describe("validateElement: check 7, key and source agree", () => {
  it("known: key with ':' fails", () => {
    expectFailure(withMerchant({ source: "known", key: "a:b", serviceId: "a:b" }), "merchant.key");
  });

  it("known: serviceId must equal key", () => {
    expectFailure(withMerchant({ source: "known", key: "netflix", serviceId: "hulu" }), "merchant.serviceId");
    expectFailure(withMerchant({ source: "known", key: "netflix", serviceId: null }), "merchant.serviceId");
    expect(validateElement(withMerchant({ source: "known", key: "netflix", serviceId: "netflix" }), 0).ok).toBe(
      true,
    );
  });

  it("generic: key needs the merchant: prefix and serviceId must be null", () => {
    expectFailure(withMerchant({ source: "generic", key: "gym", serviceId: null }), "merchant.key");
    expectFailure(withMerchant({ source: "generic", key: "unidentified:none:x" }), "merchant.key");
    expectFailure(withMerchant({ source: "generic", key: "merchant:gym", serviceId: "gym" }), "merchant.serviceId");
  });

  it("unidentified: key needs the unidentified: prefix and serviceId must be null", () => {
    const patch = { source: "unidentified", serviceId: null };
    expectFailure(withMerchant({ ...patch, key: "merchant:gym" }), "merchant.key");
    expectFailure(withMerchant({ ...patch, key: "unidentified" }), "merchant.key");
    expectFailure(
      withMerchant({ ...patch, key: "unidentified:none:x", serviceId: "x" }),
      "merchant.serviceId",
    );
    expect(validateElement(withMerchant({ ...patch, key: "unidentified:none:x" }), 0).ok).toBe(true);
  });

  it("reports the earliest failing check when several fields are bad", () => {
    const result = validateElement({ ...base(), date: "nope", currency: "x", merchant: null }, 0);
    expect(result).toEqual({ ok: false, reason: "date: not a real calendar date" });
  });
});

describe("validateElement: the returned Entry", () => {
  it("holds the parsed date, the copied fields and the input index", () => {
    const result = validateElement(charge("2026-01-15", 999, "netflix"), 7);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.index).toBe(7);
    expect(result.entry.date.iso).toBe("2026-01-15");
    expect(result.entry.amountCents).toBe(999);
    expect(result.entry.currency).toBe("USD");
    expect(result.entry.merchant).toEqual({
      key: "netflix",
      displayName: "netflix",
      source: "known",
      serviceId: "netflix",
      processor: null,
    });
    expect("rank" in result.entry).toBe(false);
  });

  it("does not share the input's merchant object", () => {
    const input = charge("2026-01-15", 999, "merchant:gym");
    const result = validateElement(input, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.merchant).not.toBe(input.merchant);
    expect(result.entry.merchant).toEqual(input.merchant);
  });

  it("does not mutate the input", () => {
    const input = charge("2026-01-15", 999, "merchant:gym");
    const copy = structuredClone(input);
    validateElement(input, 0);
    expect(input).toEqual(copy);
  });

  it("accepts a valid element with extra properties and does not copy them", () => {
    const input = { ...base(), extra: "x", merchant: { ...(base().merchant as Row), more: 1 } };
    const result = validateElement(input, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("extra" in result.entry).toBe(false);
    expect(Object.keys(result.entry.merchant).sort()).toEqual([
      "displayName",
      "key",
      "processor",
      "serviceId",
      "source",
    ]);
  });
});

describe("test-fixtures builders", () => {
  it("every builder produces an element that passes", () => {
    const keys = ["netflix", "merchant:gym", "unidentified:none:abc"];
    for (const key of keys) {
      expect(validateElement(charge("2026-01-15", 999, key), 0).ok).toBe(true);
      expect(validateElement(credit("2026-01-20", 999, key), 0).ok).toBe(true);
      expect(validateElement(zero("2026-01-01", key), 0).ok).toBe(true);
    }
  });

  it("agree with the key on source, serviceId and displayName", () => {
    expect(charge("2026-01-15", 1, "netflix").merchant).toMatchObject({ source: "known", serviceId: "netflix" });
    expect(charge("2026-01-15", 1, "merchant:gym").merchant).toMatchObject({ source: "generic", serviceId: null });
    expect(charge("2026-01-15", 1, "unidentified:none:x").merchant).toMatchObject({
      source: "unidentified",
      serviceId: null,
    });
  });

  it("set the sign, the default currency and the options", () => {
    expect(charge("2026-01-15", 999, "merchant:gym").amountCents).toBe(999);
    expect(credit("2026-01-15", 999, "merchant:gym").amountCents).toBe(-999);
    expect(zero("2026-01-15", "merchant:gym").amountCents).toBe(0);
    expect(charge("2026-01-15", 999, "merchant:gym").currency).toBe("USD");
    const eur = charge("2026-01-15", 999, "merchant:gym", { currency: "EUR", description: "GYM", displayName: "Gym" });
    expect(eur).toMatchObject({ currency: "EUR", description: "GYM", merchant: { displayName: "Gym" } });
    expect(validateElement(eur, 0).ok).toBe(true);
  });
});
