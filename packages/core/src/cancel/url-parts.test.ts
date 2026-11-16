import { describe, expect, it } from "vitest";
import { parseUrl } from "./url-parts.js";

describe("parseUrl", () => {
  it("gives the seven fields of a valid https URL", () => {
    const u = parseUrl("https://help.netflix.com/en/node/407?id=1#top");
    expect(u).not.toBeNull();
    expect(u?.href).toBe("https://help.netflix.com/en/node/407?id=1#top");
    expect(u?.protocol).toBe("https:");
    expect(u?.username).toBe("");
    expect(u?.password).toBe("");
    expect(u?.port).toBe("");
    expect(u?.hostname).toBe("help.netflix.com");
    expect(u?.search).toBe("?id=1");
  });

  it("reads user name, password and port", () => {
    const u = parseUrl("https://a:b@example.com:8443/");
    expect(u?.username).toBe("a");
    expect(u?.password).toBe("b");
    expect(u?.port).toBe("8443");
  });

  it("gives null for a non-string", () => {
    expect(parseUrl(42)).toBeNull();
    expect(parseUrl(undefined)).toBeNull();
    expect(parseUrl(null)).toBeNull();
  });

  it("gives null for text the parser rejects", () => {
    expect(parseUrl("not a url")).toBeNull();
    expect(parseUrl("")).toBeNull();
  });
});
