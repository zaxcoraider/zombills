import { describe, expect, it } from "vitest";
import {
  DENIED_DOMAINS,
  TRACKING_PARAMS,
  checkDomains,
  checkUrl,
  isOnDomain,
} from "./url-rules.js";

const D = ["netflix.com"];
const rules = (text: unknown, domains: readonly string[] = D): string[] =>
  checkUrl(text, domains, "url").map((i) => i.rule);

describe("isOnDomain", () => {
  it("accepts the domain and its sub-domains", () => {
    expect(isOnDomain("netflix.com", "netflix.com")).toBe(true);
    expect(isOnDomain("help.netflix.com", "netflix.com")).toBe(true);
    expect(isOnDomain("a.b.netflix.com", "netflix.com")).toBe(true);
  });

  it("rejects look-alikes", () => {
    expect(isOnDomain("notnetflix.com", "netflix.com")).toBe(false);
    expect(isOnDomain("netflix.com.evil.example", "netflix.com")).toBe(false);
    expect(isOnDomain("com", "netflix.com")).toBe(false);
  });
});

describe("TRACKING_PARAMS", () => {
  const NAMES = [
    "gclid",
    "gbraid",
    "wbraid",
    "dclid",
    "fbclid",
    "msclkid",
    "yclid",
    "igshid",
    "twclid",
    "ttclid",
    "li_fat_id",
    "mc_cid",
    "mc_eid",
    "_ga",
    "_gl",
    "_hsenc",
    "_hsmi",
    "ref",
    "ref_",
    "referrer",
    "source",
    "src",
    "campaign",
    "cmp",
    "cid",
    "trk",
    "affiliate",
    "aff_id",
    "partner",
    "promo",
  ];

  it("holds every name of the Glossary and nothing else", () => {
    expect([...TRACKING_PARAMS].sort()).toEqual([...NAMES].sort());
  });

  it.each(NAMES)("checkUrl flags %s, also in upper case", (name) => {
    expect(rules("https://netflix.com/?" + name + "=1")).toEqual(["tracking-param"]);
    expect(rules("https://netflix.com/?" + name.toUpperCase() + "=1")).toEqual(["tracking-param"]);
  });
});

describe("DENIED_DOMAINS", () => {
  it("holds the Req 6.3 list", () => {
    for (const d of [
      "co.uk",
      "com.au",
      "github.io",
      "netlify.app",
      "vercel.app",
      "pages.dev",
      "web.app",
      "firebaseapp.com",
      "herokuapp.com",
      "blogspot.com",
      "bit.ly",
      "t.co",
      "goo.gl",
      "tinyurl.com",
      "lnkd.in",
    ]) {
      expect(DENIED_DOMAINS.has(d)).toBe(true);
    }
  });
});

describe("checkUrl", () => {
  it("accepts a clean URL, a fragment and a non-tracking query", () => {
    expect(rules("https://help.netflix.com/en/node/407")).toEqual([]);
    expect(rules("https://help.netflix.com/en/node/407?id=5#utm_source")).toEqual([]);
  });

  it("gives only url-form for text the parser rejects", () => {
    expect(rules("not a url")).toEqual(["url-form"]);
    expect(rules(7)).toEqual(["url-form"]);
  });

  it("gives https-only for http", () => {
    expect(rules("http://netflix.com/")).toEqual(["https-only"]);
  });

  it("gives provider-domain for another host", () => {
    expect(rules("https://notnetflix.com/")).toEqual(["provider-domain"]);
    expect(rules("https://netflix.com/", [])).toEqual(["provider-domain"]);
  });

  it("gives tracking-param once, naming the parameter", () => {
    const issues = checkUrl("https://netflix.com/?utm_a=1&gclid=2", D, "url");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.rule).toBe("tracking-param");
    expect(issues[0]?.message).toContain("utm_a");
  });

  it("decodes the query name before comparing", () => {
    expect(rules("https://netflix.com/?%67clid=1")).toEqual(["tracking-param"]);
  });

  it.each([
    ["a user name", "https://u:p@netflix.com/"],
    ["a port", "https://netflix.com:8443/"],
    ["an IPv4 host", "https://127.0.0.1/"],
    ["an IPv6 host", "https://[::1]/"],
    ["a single-label host", "https://localhost/"],
    ["a non-canonical form", "https://NETFLIX.com"],
    ["a query name that does not decode", "https://netflix.com/?%E0%A4%A=1"],
  ])("gives url-form for %s", (_label, text) => {
    expect(rules(text, ["netflix.com", "127.0.0.1", "[::1]", "localhost"])).toContain("url-form");
  });

  it("reports each broken rule once", () => {
    const issues = checkUrl("http://u@evil.com:80/?utm_a=1&fbclid=2", D, "url");
    expect(issues.map((i) => i.rule).sort()).toEqual([
      "https-only",
      "provider-domain",
      "tracking-param",
      "url-form",
    ]);
  });

  it("uses the field name it is given", () => {
    expect(checkUrl("nope", D, "regionalUrls.UK")[0]?.field).toBe("regionalUrls.UK");
  });
});

describe("checkDomains", () => {
  it("accepts well-formed domains", () => {
    expect(checkDomains(["netflix.com", "nflx.net"], "providerDomains")).toEqual({
      issues: [],
      valid: ["netflix.com", "nflx.net"],
    });
  });

  it.each([
    ["not an array", "netflix.com"],
    ["an empty array", []],
  ])("gives field-type for %s", (_label, value) => {
    const r = checkDomains(value, "providerDomains");
    expect(r.issues.map((i) => i.rule)).toEqual(["field-type"]);
    expect(r.valid).toEqual([]);
  });

  it.each([
    ["not a string", 5],
    ["upper case", "Netflix.com"],
    ["one label", "netflix"],
    ["an empty label", "a..com"],
    ["a leading dot", ".netflix.com"],
    ["a www prefix", "www.netflix.com"],
    ["denied", "co.uk"],
    ["denied", "netlify.app"],
  ])("gives domain-form for %s", (_label, item) => {
    const r = checkDomains(["netflix.com", item], "providerDomains");
    expect(r.issues.map((i) => [i.field, i.rule])).toEqual([["providerDomains[1]", "domain-form"]]);
    expect(r.valid).toEqual(["netflix.com"]);
  });

  it("gives domain-form for a duplicate, at the later index", () => {
    const r = checkDomains(["a.com", "b.com", "a.com"], "providerDomains");
    expect(r.issues.map((i) => i.field)).toEqual(["providerDomains[2]"]);
    expect(r.valid).toEqual(["a.com", "b.com"]);
  });
});
