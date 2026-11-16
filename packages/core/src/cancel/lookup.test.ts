import { describe, expect, it } from "vitest";
import { getCancelHelp, lookupIn, statementRegion } from "./lookup.js";
import type { CancelEntry } from "./types.js";

function entry(over: Partial<CancelEntry> = {}): CancelEntry {
  return {
    serviceId: "netflix",
    providerDomains: ["netflix.com"],
    url: "https://www.netflix.com/cancelplan",
    kind: "cancel",
    regionalUrls: {},
    steps: ["Sign in and open Account.", "Choose Cancel Membership."],
    appStoreMayApply: true,
    lastChecked: null,
    ...over,
  };
}

describe("statementRegion", () => {
  it.each([
    ["USD", "US"],
    ["GBP", "UK"],
    ["EUR", "EU"],
    ["usd", null],
    [" USD", null],
    ["JPY", null],
    ["", null],
  ])("%j gives %j", (currency, region) => {
    expect(statementRegion(currency)).toBe(region);
  });
});

describe("getCancelHelp on ids with no entry", () => {
  it.each([null, "Netflix", "merchant:riverside-gym", "constructor", "__proto__"])(
    "%j gives email-only with the value passed in",
    (id) => {
      expect(getCancelHelp(id, "USD")).toEqual({ kind: "email-only", serviceId: id });
    },
  );

  it.each(["toString", "hasOwnProperty", ""])("%j gives email-only", (id) => {
    expect(getCancelHelp(id, "USD")).toEqual({ kind: "email-only", serviceId: id });
  });

  it("gives serviceId null for a value that is not a string", () => {
    expect(getCancelHelp(42 as unknown as string, "USD")).toEqual({
      kind: "email-only",
      serviceId: null,
    });
  });
});

describe("lookupIn with a fixture netflix entry", () => {
  const find = lookupIn([entry()]);

  it("gives a link for netflix", () => {
    expect(find("netflix", "USD").kind).toBe("link");
  });

  it("gives email-only for Netflix with a capital", () => {
    expect(find("Netflix", "USD")).toEqual({ kind: "email-only", serviceId: "Netflix" });
  });

  it("gives email-only for a space-padded id", () => {
    expect(find(" netflix", "USD")).toEqual({ kind: "email-only", serviceId: " netflix" });
  });
});

describe("region choice", () => {
  const regional = lookupIn([
    entry({ regionalUrls: { UK: "https://www.netflix.com/uk/cancelplan" } }),
  ]);
  const plain = lookupIn([entry()]);

  it("uses the UK URL for GBP", () => {
    expect(regional("netflix", "GBP")).toMatchObject({
      url: "https://www.netflix.com/uk/cancelplan",
    });
  });

  it.each(["EUR", "USD", "JPY"])("uses the default url for %s", (currency) => {
    expect(regional("netflix", currency)).toMatchObject({
      url: "https://www.netflix.com/cancelplan",
    });
  });

  it.each(["GBP", "EUR", "USD", "JPY", ""])(
    "uses the default with no regional URLs for %j",
    (c) => {
      expect(plain("netflix", c)).toMatchObject({ url: "https://www.netflix.com/cancelplan" });
    },
  );
});

describe("fields of a link", () => {
  it("drops www. from the host", () => {
    expect(lookupIn([entry()])("netflix", "USD")).toMatchObject({ host: "netflix.com" });
  });

  it("keeps other subdomains", () => {
    const find = lookupIn([entry({ url: "https://help.netflix.com/en/node/407" })]);
    expect(find("netflix", "USD")).toMatchObject({ host: "help.netflix.com" });
  });

  it("copies linkKind, steps, appStoreMayApply and lastChecked from the entry", () => {
    const e = entry({ kind: "manage", appStoreMayApply: false, lastChecked: "2026-01-02" });
    expect(lookupIn([e])("netflix", "USD")).toEqual({
      kind: "link",
      serviceId: "netflix",
      url: e.url,
      linkKind: "manage",
      host: "netflix.com",
      steps: e.steps,
      appStoreMayApply: false,
      lastChecked: "2026-01-02",
    });
  });
});
