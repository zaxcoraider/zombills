import { describe, expect, it } from "vitest";
import { matchKnownService } from "./match-known.js";

function id(context: string, cleaned: string = context): string | undefined {
  const split = (s: string): string[] => (s === "" ? [] : s.split(" "));
  return matchKnownService(split(context), split(cleaned))?.serviceId;
}

describe("matchKnownService", () => {
  it("matches whole tokens only", () => {
    expect(id("netflix")).toBe("netflix");
    expect(id("apple music")).toBe("apple-music");
    expect(id("applebees")).toBeUndefined();
    expect(id("netflixes")).toBeUndefined();
    expect(id("apple")).toBeUndefined();
  });

  it("matches a contains variant inside a longer token list", () => {
    expect(id("foo netflix bar")).toBe("netflix");
  });

  it("uses exact variants only for the whole cleaned text", () => {
    expect(id("max mustermann")).toBeUndefined();
    expect(id("calm waters spa")).toBeUndefined();
    expect(id("medium roast")).toBeUndefined();
    expect(id("max")).toBe("max");
    expect(id("calm")).toBe("calm");
    expect(id("medium")).toBe("medium");
  });

  it("separates Amazon, YouTube and similar families", () => {
    expect(id("amazon prime video")).toBe("amazon-prime");
    expect(id("amazon music")).toBe("amazon-music");
    expect(id("amazon music unlimited")).toBe("amazon-music");
    expect(id("youtube premium")).toBe("youtube-premium");
    expect(id("youtube music")).toBe("youtube-music");
    expect(id("youtube")).toBeUndefined();
  });

  it("counts a hit found only in the cleaned list", () => {
    expect(id("uber 0412 one", "uber one")).toBe("uber-one");
  });

  it("counts a hit found only in the context list", () => {
    expect(id("microsoft 365", "microsoft")).toBe("microsoft-365");
  });

  it("matches an exact variant against the cleaned list even when context differs", () => {
    expect(id("max 0412", "max")).toBe("max");
    expect(id("max", "max mustermann")).toBeUndefined();
  });

  it("prefers the longest variant text", () => {
    expect(id("amazon music unlimited")).toBe("amazon-music");
    expect(id("hbo max")).toBe("max");
  });

  it("gives ties between equal-length variants to the earlier service", () => {
    // "hulu" and "dazn" are both 4 characters; hulu is listed first.
    expect(id("dazn hulu")).toBe("hulu");
    expect(id("hulu dazn")).toBe("hulu");
  });

  it("returns null for empty input", () => {
    expect(matchKnownService([], [])).toBeNull();
  });
});
