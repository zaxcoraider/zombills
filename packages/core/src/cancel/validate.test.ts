import { describe, expect, it } from "vitest";
import type { AppStoreLinks, CancelEntry, EmailOnlyService } from "./types.js";
import { validateCancelDatabase } from "./validate.js";

const ENTRY: CancelEntry = {
  serviceId: "alpha",
  providerDomains: ["alpha.com"],
  url: "https://alpha.com/cancel",
  kind: "cancel",
  regionalUrls: {},
  steps: ["Sign in and open Account.", "Choose Cancel."],
  appStoreMayApply: false,
  lastChecked: null,
};

const EMAIL_ONLY: EmailOnlyService = {
  serviceId: "beta",
  reason: "In person only",
  lastChecked: null,
};

const LINKS: AppStoreLinks = {
  apple: {
    label: "Apple subscriptions",
    url: "https://apps.apple.com/account/subscriptions",
    providerDomains: ["apple.com"],
  },
  google: {
    label: "Google Play subscriptions",
    url: "https://play.google.com/store/account/subscriptions",
    providerDomains: ["google.com"],
  },
};

/** Entries, email-only ids and links are passed as unknown on purpose: fixtures hold bad shapes. */
function run(
  entries: unknown[] = [ENTRY],
  emailOnly: unknown[] = [EMAIL_ONLY],
  links: unknown = LINKS,
  known: unknown = ["alpha", "beta"],
  options?: unknown,
) {
  return validateCancelDatabase(
    entries as CancelEntry[],
    emailOnly as EmailOnlyService[],
    known as string[],
    links as AppStoreLinks,
    options as { requireVerified?: boolean },
  );
}

const pairs = (issues: ReturnType<typeof run>): string[] =>
  issues.map((i) => i.rule + "@" + i.field);

const withEntry = (patch: Record<string, unknown>): unknown => ({ ...ENTRY, ...patch });

describe("valid data", () => {
  it("gives no issue for the valid fixture", () => {
    expect(run()).toEqual([]);
  });

  it("accepts a fragment, a non-tracking query, 2028-02-29 and regional URLs", () => {
    const ok = withEntry({
      url: "https://alpha.com/cancel?id=123#top",
      regionalUrls: { US: "https://alpha.com/us/", UK: "https://help.alpha.com/uk/" },
      lastChecked: "2028-02-29",
    });
    expect(run([ok])).toEqual([]);
  });
});

describe("coverage rules", () => {
  it("missing-service", () => {
    const issues = run([ENTRY], [EMAIL_ONLY], LINKS, ["alpha", "beta", "gamma"]);
    expect(pairs(issues)).toEqual(["missing-service@serviceId"]);
    expect(issues[0]?.serviceId).toBe("gamma");
  });

  it("unknown-service for an id outside the Known ids and for a non-string id", () => {
    expect(pairs(run([withEntry({ serviceId: "zeta" })]))).toEqual([
      "unknown-service@serviceId",
      "missing-service@serviceId",
    ]);
    expect(pairs(run([withEntry({ serviceId: 7 })]))).toEqual([
      "unknown-service@serviceId",
      "missing-service@serviceId",
    ]);
  });

  it("duplicate-id", () => {
    expect(pairs(run([ENTRY, ENTRY]))).toEqual(["duplicate-id@serviceId"]);
  });

  it("listed-twice", () => {
    expect(pairs(run([ENTRY], [{ ...EMAIL_ONLY, serviceId: "alpha" }]))).toEqual([
      "listed-twice@serviceId",
      "missing-service@serviceId",
    ]);
  });

  it("unsorted", () => {
    const b = withEntry({
      serviceId: "beta",
      providerDomains: ["beta.com"],
      url: "https://beta.com/",
    });
    const issues = run([b, ENTRY], [], LINKS, ["alpha", "beta"]);
    expect(pairs(issues)).toEqual(["unsorted@serviceId"]);
    expect(issues[0]?.serviceId).toBe("alpha");
  });
});

describe("URL rules", () => {
  const urlRules = (url: unknown) => pairs(run([withEntry({ url })]));

  it("https-only", () => {
    expect(urlRules("http://alpha.com/cancel")).toEqual(["https-only@url"]);
  });

  it.each([
    ["not a URL", "not a url"],
    ["a non-string url", 42],
    ["user info", "https://me@alpha.com/"],
    ["a port", "https://alpha.com:8443/"],
    ["an IPv4 host", "https://127.0.0.1/"],
    ["an IPv6 host", "https://[::1]/"],
    ["localhost", "https://localhost/"],
    ["a single label", "https://alpha/"],
    ["a non-canonical host", "https://Alpha.com/"],
    ["a missing slash", "https://alpha.com"],
    ["a bad % in a query name", "https://alpha.com/?%zz=1"],
  ])("url-form: %s", (_name, url) => {
    expect(urlRules(url)).toContain("url-form@url");
  });

  it("an unparseable or non-string URL gives only url-form", () => {
    expect(urlRules("not a url")).toEqual(["url-form@url"]);
    expect(urlRules(42)).toEqual(["url-form@url"]);
  });

  it("provider-domain", () => {
    expect(urlRules("https://notalpha.com/")).toEqual(["provider-domain@url"]);
  });

  it.each([
    "https://alpha.com/?utm_source=x",
    "https://alpha.com/?UTM_Medium=x",
    "https://alpha.com/?%75tm_x=1",
    "https://alpha.com/?gclid=1",
    "https://alpha.com/?ref=1",
  ])("tracking-param: %s", (url) => {
    expect(urlRules(url)).toContain("tracking-param@url");
  });

  it("checks regional URLs with the same rules", () => {
    const issues = run([withEntry({ regionalUrls: { UK: "http://alpha.com/uk" } })]);
    expect(pairs(issues)).toEqual(["https-only@regionalUrls.UK"]);
  });
});

describe("domain-form", () => {
  const domainRules = (providerDomains: unknown) => pairs(run([withEntry({ providerDomains })]));

  it.each([
    ["upper case", ["Alpha.com"]],
    ["www.", ["www.alpha.com"]],
    ["a denied suffix", ["alpha.com", "co.uk"]],
    ["a single label", ["alpha.com", "alpha"]],
    ["a duplicate", ["alpha.com", "alpha.com"]],
    ["a non-string", ["alpha.com", 5]],
  ])("%s", (_name, domains) => {
    expect(domainRules(domains)).toContain(
      "domain-form@providerDomains[" + String((domains as unknown[]).length - 1) + "]",
    );
  });

  it("a bad domain does not count for the URL host", () => {
    expect(domainRules(["Alpha.com"])).toEqual([
      "domain-form@providerDomains[0]",
      "provider-domain@url",
    ]);
  });
});

describe("steps", () => {
  const stepRules = (steps: unknown) => pairs(run([withEntry({ steps })]));

  it("steps-count: 0, 4 and missing", () => {
    expect(stepRules([])).toEqual(["steps-count@steps"]);
    expect(stepRules(["One step.", "Two step.", "Three step.", "Four step."])).toEqual([
      "steps-count@steps",
    ]);
    const { steps: _steps, ...rest } = ENTRY;
    void _steps;
    expect(pairs(run([rest]))).toEqual(["steps-count@steps"]);
    expect(stepRules("Sign in.")).toEqual(["steps-count@steps"]);
  });

  it.each([
    ["not a string", 5],
    ["too short", "Go"],
    ["too long", "A".repeat(120) + "."],
    ["padded", " Sign in. "],
    ["a line break", "Sign in\nand go."],
    ["a carriage return", "Sign in\rand go."],
    ["U+2028", "Sign in\u2028and go."],
    ["U+2029", "Sign in\u2029and go."],
    ["a <", "Open <Account>."],
    ["a >", "Open Account>."],
    ["http://", "Open http://alpha.com now."],
    ["https://", "Open https://alpha.com now."],
    ["www.", "Open www.alpha.com now."],
    ["a !", "Sign in now!"],
    ["no full stop", "Sign in and open Account"],
  ])("step-text: %s", (_name, step) => {
    expect(stepRules([step])).toEqual(["step-text@steps[0]"]);
  });

  it("accepts steps of 3 and 120 characters", () => {
    expect(stepRules(["Go.", "A".repeat(119) + "."])).toEqual([]);
  });
});

describe("regions", () => {
  const regionRules = (regionalUrls: unknown) => pairs(run([withEntry({ regionalUrls })]));

  it("region-key: FR, and a non-object", () => {
    expect(regionRules({ FR: "https://alpha.com/fr/" })).toEqual(["region-key@regionalUrls.FR"]);
    expect(regionRules("US")).toEqual(["region-key@regionalUrls"]);
    expect(regionRules(null)).toEqual(["region-key@regionalUrls"]);
    expect(regionRules([])).toEqual(["region-key@regionalUrls"]);
  });

  it("region-duplicate: equal to url", () => {
    expect(regionRules({ UK: ENTRY.url })).toEqual(["region-duplicate@regionalUrls.UK"]);
  });

  it("region-duplicate: two equal regional URLs, reported on the later one", () => {
    const same = "https://alpha.com/same/";
    expect(regionRules({ US: same, UK: same })).toEqual(["region-duplicate@regionalUrls.UK"]);
  });
});

describe("dates", () => {
  const dateRules = (lastChecked: unknown) => pairs(run([withEntry({ lastChecked })]));

  it.each(["2026-02-29", "2026-13-01", "2024-12-31", "2026-1-01", 20260101, undefined])(
    "date-form: %s",
    (value) => {
      expect(dateRules(value)).toEqual(["date-form@lastChecked"]);
    },
  );

  it("accepts null, 2028-02-29 and 2025-01-01", () => {
    expect(dateRules(null)).toEqual([]);
    expect(dateRules("2028-02-29")).toEqual([]);
    expect(dateRules("2025-01-01")).toEqual([]);
  });

  it("checks the date of an email-only id", () => {
    const issues = run([ENTRY], [{ ...EMAIL_ONLY, lastChecked: "2026-02-29" }]);
    expect(pairs(issues)).toEqual(["date-form@lastChecked"]);
  });
});

describe("field-type and malformed values", () => {
  const typeRules = (patch: Record<string, unknown>) => pairs(run([withEntry(patch)]));

  it("kind, appStoreMayApply and providerDomains", () => {
    expect(typeRules({ kind: "other" })).toEqual(["field-type@kind"]);
    expect(typeRules({ appStoreMayApply: "yes" })).toEqual(["field-type@appStoreMayApply"]);
    expect(typeRules({ providerDomains: [] })).toContain("field-type@providerDomains");
    expect(typeRules({ providerDomains: "alpha.com" })).toContain("field-type@providerDomains");
  });

  it("reason of an email-only id", () => {
    expect(pairs(run([ENTRY], [{ ...EMAIL_ONLY, reason: "  " }]))).toEqual(["field-type@reason"]);
    expect(pairs(run([ENTRY], [{ ...EMAIL_ONLY, reason: 3 }]))).toEqual(["field-type@reason"]);
  });

  it("a null entry and a non-object record", () => {
    const issues = run([null, ENTRY], [EMAIL_ONLY], LINKS, ["alpha", "beta"]);
    expect(pairs(issues)).toEqual(["field-type@entry"]);
    expect(pairs(run([ENTRY], ["x"]))).toEqual(["field-type@entry", "missing-service@serviceId"]);
    expect(pairs(run([[]]))).toContain("field-type@entry");
  });

  it("lists that are not arrays", () => {
    expect(pairs(run("x" as unknown as unknown[], [], LINKS, []))).toEqual(["field-type@entries"]);
    expect(pairs(run([], null as unknown as unknown[], LINKS, []))).toEqual([
      "field-type@emailOnly",
    ]);
    expect(() => run([], [], LINKS, null)).not.toThrow();
  });

  it("appStoreLinks that is not an object, and a missing google link", () => {
    expect(pairs(run([ENTRY], [EMAIL_ONLY], null))).toEqual(["field-type@appStoreLinks"]);
    expect(pairs(run([ENTRY], [EMAIL_ONLY], 5))).toEqual(["field-type@appStoreLinks"]);
    const issues = run([ENTRY], [EMAIL_ONLY], { apple: LINKS.apple });
    expect(pairs(issues)).toEqual(["field-type@google"]);
    expect(issues[0]?.serviceId).toBeNull();
  });

  it("App-store link fields use their own names", () => {
    const bad = {
      apple: { label: "", providerDomains: ["apple.com"], url: "http://apple.com/x" },
      google: { ...LINKS.google, url: "https://elsewhere.com/" },
    };
    const issues = run([ENTRY], [EMAIL_ONLY], bad);
    expect(pairs(issues)).toEqual(["field-type@label", "https-only@url", "provider-domain@url"]);
    expect(issues.every((i) => i.serviceId === null)).toBe(true);
  });

  it("never throws on odd input", () => {
    const odd = [undefined, 1, "s", true, {}, [], () => 1, { serviceId: {} }];
    for (const v of odd) {
      expect(() => run([v], [v], v, [v], v)).not.toThrow();
    }
  });
});

describe("requireVerified", () => {
  it("reports an unverified issue only when asked", () => {
    expect(run()).toEqual([]);
    expect(run([ENTRY], [EMAIL_ONLY], LINKS, ["alpha", "beta"], {})).toEqual([]);
    expect(
      pairs(run([ENTRY], [EMAIL_ONLY], LINKS, ["alpha", "beta"], { requireVerified: true })),
    ).toEqual(["unverified@lastChecked", "unverified@lastChecked"]);
  });

  it("skips a verified record", () => {
    const done = withEntry({ lastChecked: "2026-03-01" });
    const issues = run([done], [EMAIL_ONLY], LINKS, ["alpha", "beta"], { requireVerified: true });
    expect(issues.map((i) => i.serviceId)).toEqual(["beta"]);
  });

  it("treats absent, null and non-object options as {}", () => {
    for (const options of [undefined, null, "yes", 5, []]) {
      expect(run([ENTRY], [EMAIL_ONLY], LINKS, ["alpha", "beta"], options)).toEqual([]);
    }
  });
});

describe("output order", () => {
  it("sorts by list, index, field, sub-field and rule", () => {
    const many = Array.from({ length: 11 }, (_, i) => (i === 2 || i === 10 ? "bad" : "Fine step."));
    const first = withEntry({
      steps: many,
      url: "http://alpha.com/cancel?utm_source=x",
      regionalUrls: {
        EU: "http://alpha.com/eu",
        FR: "https://alpha.com/fr",
        US: "http://alpha.com/us",
      },
    });
    const second = withEntry({
      serviceId: "alpha",
      kind: "x",
      lastChecked: "bad",
    });
    const issues = run(
      [first, second, null],
      [{ ...EMAIL_ONLY, reason: "" }],
      { apple: LINKS.apple },
      ["alpha", "beta", "missing"],
    );
    expect(issues.map((i) => i.rule + "@" + i.field)).toEqual([
      "https-only@url",
      "tracking-param@url",
      "https-only@regionalUrls.US",
      "https-only@regionalUrls.EU",
      "region-key@regionalUrls.FR",
      "steps-count@steps",
      "step-text@steps[2]",
      "step-text@steps[10]",
      "duplicate-id@serviceId",
      "field-type@kind",
      "date-form@lastChecked",
      "field-type@entry",
      "field-type@reason",
      "field-type@google",
      "missing-service@serviceId",
    ]);
  });

  it("is the same for the same input", () => {
    const bad = [withEntry({ url: "http://x", steps: [] }), ENTRY];
    expect(run(bad)).toEqual(run(bad));
  });
});
