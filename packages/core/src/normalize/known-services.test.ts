import { describe, expect, it } from "vitest";
import { KNOWN_SERVICES, getKnownService } from "./known-services.js";
import { joinTokens, lex } from "./lex.js";
import { CARD_PREFIXES, MONTHS } from "./noise-lists.js";
import type { ServiceCategory } from "./types.js";

/** The Req 4.2 table: serviceId, display name, category, in design order. */
const EXPECTED: readonly (readonly [string, string, ServiceCategory])[] = [
  ["netflix", "Netflix", "video-streaming"],
  ["disney-plus", "Disney+", "video-streaming"],
  ["hulu", "Hulu", "video-streaming"],
  ["max", "Max", "video-streaming"],
  ["paramount-plus", "Paramount+", "video-streaming"],
  ["peacock", "Peacock", "video-streaming"],
  ["apple-tv-plus", "Apple TV+", "video-streaming"],
  ["youtube-premium", "YouTube Premium", "video-streaming"],
  ["amazon-prime", "Amazon Prime", "video-streaming"],
  ["crunchyroll", "Crunchyroll", "video-streaming"],
  ["dazn", "DAZN", "video-streaming"],
  ["espn-plus", "ESPN+", "video-streaming"],
  ["discovery-plus", "discovery+", "video-streaming"],
  ["sling-tv", "Sling TV", "video-streaming"],
  ["spotify", "Spotify", "music-audio"],
  ["apple-music", "Apple Music", "music-audio"],
  ["amazon-music", "Amazon Music Unlimited", "music-audio"],
  ["youtube-music", "YouTube Music", "music-audio"],
  ["tidal", "TIDAL", "music-audio"],
  ["deezer", "Deezer", "music-audio"],
  ["audible", "Audible", "music-audio"],
  ["siriusxm", "SiriusXM", "music-audio"],
  ["pandora", "Pandora", "music-audio"],
  ["microsoft-365", "Microsoft 365", "software"],
  ["adobe", "Adobe Creative Cloud", "software"],
  ["1password", "1Password", "software"],
  ["nordvpn", "NordVPN", "software"],
  ["expressvpn", "ExpressVPN", "software"],
  ["canva", "Canva", "software"],
  ["chatgpt-plus", "ChatGPT Plus", "software"],
  ["duolingo", "Duolingo", "software"],
  ["grammarly", "Grammarly", "software"],
  ["linkedin-premium", "LinkedIn Premium", "software"],
  ["icloud", "iCloud+", "cloud-storage"],
  ["google-one", "Google One", "cloud-storage"],
  ["dropbox", "Dropbox", "cloud-storage"],
  ["new-york-times", "The New York Times", "news-reading"],
  ["washington-post", "The Washington Post", "news-reading"],
  ["wall-street-journal", "The Wall Street Journal", "news-reading"],
  ["the-economist", "The Economist", "news-reading"],
  ["the-guardian", "The Guardian", "news-reading"],
  ["medium", "Medium", "news-reading"],
  ["kindle-unlimited", "Kindle Unlimited", "news-reading"],
  ["peloton", "Peloton", "fitness-wellness"],
  ["strava", "Strava", "fitness-wellness"],
  ["classpass", "ClassPass", "fitness-wellness"],
  ["headspace", "Headspace", "fitness-wellness"],
  ["calm", "Calm", "fitness-wellness"],
  ["planet-fitness", "Planet Fitness", "fitness-wellness"],
  ["doordash-dashpass", "DashPass", "food-delivery"],
  ["uber-one", "Uber One", "food-delivery"],
  ["grubhub-plus", "Grubhub+", "food-delivery"],
  ["instacart-plus", "Instacart+", "food-delivery"],
  ["deliveroo-plus", "Deliveroo Plus", "food-delivery"],
  ["hellofresh", "HelloFresh", "food-delivery"],
  ["xbox-game-pass", "Xbox Game Pass", "gaming"],
  ["playstation-plus", "PlayStation Plus", "gaming"],
  ["nintendo-switch-online", "Nintendo Switch Online", "gaming"],
  ["ea-play", "EA Play", "gaming"],
];

const EXACT_VARIANTS = ["max", "calm", "medium", "peacock", "tidal", "pandora", "sling"];

const EXCLUDED_TEXTS = [
  "microsoft",
  "msft",
  "xbox",
  "playstation",
  "playstation network",
  "ps",
  "sony",
  "nintendo",
  "electronic arts",
  "ea",
  "kindle",
  "kindle svcs",
  "uber",
  "uber eats",
  "doordash",
  "amazon",
  "amzn",
  "prime video",
  "apple",
  "google",
  "youtube",
  "streaming",
  "premium",
  "musik",
];

function canonical(text: string): string {
  return joinTokens(
    lex(text).filter((lexeme) => lexeme.kind === "word"),
    "folded",
  );
}

const ALL_VARIANTS = KNOWN_SERVICES.flatMap((entry) =>
  entry.variants.map((variant) => ({ entry, variant })),
);

describe("KNOWN_SERVICES", () => {
  it("has 59 services", () => {
    expect(KNOWN_SERVICES).toHaveLength(59);
    expect(EXPECTED).toHaveLength(59);
  });

  it("has unique ids in kebab-case", () => {
    const ids = KNOWN_SERVICES.map((entry) => entry.serviceId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("matches the Req 4.2 ids, display names and categories, in order", () => {
    expect(
      KNOWN_SERVICES.map((entry) => [entry.serviceId, entry.displayName, entry.category]),
    ).toEqual(EXPECTED);
  });

  it("gives every service at least two variants, one equal to the folded display name", () => {
    for (const entry of KNOWN_SERVICES) {
      expect(entry.variants.length, entry.serviceId).toBeGreaterThanOrEqual(2);
      expect(
        entry.variants.map((variant) => variant.text),
        entry.serviceId,
      ).toContain(canonical(entry.displayName));
    }
  });

  it.each(ALL_VARIANTS)("writes variant $variant.text in canonical form", ({ variant }) => {
    expect(variant.text).toBe(canonical(variant.text));
    expect(variant.text).not.toBe("");
  });

  it("shares no variant text between two services", () => {
    const owners = new Map<string, string>();
    for (const { entry, variant } of ALL_VARIANTS) {
      const owner = owners.get(variant.text);
      expect(owner === undefined || owner === entry.serviceId, variant.text).toBe(true);
      owners.set(variant.text, entry.serviceId);
    }
  });

  it("uses no card prefix, month or 1-2 digit number as a variant token", () => {
    const prefixTokens = new Set(CARD_PREFIXES.flat());
    const months = new Set(MONTHS);
    for (const { variant } of ALL_VARIANTS) {
      for (const token of variant.text.split(" ")) {
        expect(prefixTokens.has(token), `${variant.text}: ${token} is a card prefix`).toBe(false);
        expect(months.has(token), `${variant.text}: ${token} is a month`).toBe(false);
        expect(/^[0-9]{1,2}$/u.test(token), `${variant.text}: ${token} is a number`).toBe(false);
      }
    }
  });

  it("uses exact for the ambiguous names", () => {
    for (const text of EXACT_VARIANTS) {
      const hit = ALL_VARIANTS.filter(({ variant }) => variant.text === text);
      expect(hit, text).toHaveLength(1);
      expect(hit[0]?.variant.match, text).toBe("exact");
    }
    const exactTexts = ALL_VARIANTS.filter(({ variant }) => variant.match === "exact").map(
      ({ variant }) => variant.text,
    );
    expect([...exactTexts].sort()).toEqual([...EXACT_VARIANTS].sort());
  });

  it("includes none of the Req 4.8 excluded tokens as a variant", () => {
    const texts = new Set(ALL_VARIANTS.map(({ variant }) => variant.text));
    for (const text of EXCLUDED_TEXTS) expect(texts.has(text), text).toBe(false);
  });

  it("is deeply frozen and rejects writes", () => {
    expect(Object.isFrozen(KNOWN_SERVICES)).toBe(true);
    for (const entry of KNOWN_SERVICES) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.variants)).toBe(true);
      for (const variant of entry.variants) expect(Object.isFrozen(variant)).toBe(true);
    }
    const first = KNOWN_SERVICES[0];
    if (first === undefined) throw new Error("empty list");
    expect(() => {
      (first as { displayName: string }).displayName = "x";
    }).toThrow(TypeError);
    expect(() => {
      (first.variants as { text: string; match: string }[]).push({ text: "x", match: "exact" });
    }).toThrow(TypeError);
    expect(() => {
      (first.variants[0] as { text: string }).text = "x";
    }).toThrow(TypeError);
    expect(() => {
      (KNOWN_SERVICES as unknown[]).push({});
    }).toThrow(TypeError);
  });
});

describe("getKnownService", () => {
  it("returns the frozen list object for each id", () => {
    for (const entry of KNOWN_SERVICES) expect(getKnownService(entry.serviceId)).toBe(entry);
  });

  it("returns undefined for unknown ids", () => {
    for (const id of ["", "nope", "NETFLIX", "constructor", "__proto__", "toString"]) {
      expect(getKnownService(id), id).toBeUndefined();
    }
  });
});
