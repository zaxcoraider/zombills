import { describe, expect, it } from "vitest";
import { routeFromHash } from "./use-hash-route";

describe("routeFromHash", () => {
  it.each([
    ["", "page"],
    ["#", "page"],
    ["#spike", "spike"],
    ["#SPIKE", "page"],
    ["#other", "page"],
  ] as const)("maps %j to %s", (hash, route) => {
    expect(routeFromHash(hash)).toBe(route);
  });
});
