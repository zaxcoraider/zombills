import { describe, expect, it } from "vitest";
import * as motionValues from "./motion";
import {
  BURIAL_FALLBACK_MS,
  CARD_REDUCED_VARIANTS,
  CARD_RISE_SPRING,
  CARD_SETTLE_SPRING,
  CARD_VARIANTS,
  COUNTER_TWEEN,
  REDUCED_FADE,
  SHUDDER,
  SINK,
  SINK_EASE,
  TOMBSTONE_RISE_SPRING,
  cardVariants,
  counterFade,
  fogFade,
  moundMotion,
  tombstoneMotion,
} from "./motion";

type Dict = Record<string, unknown>;

/** Every key that a target object animates, ignoring `transition`. */
function animatedKeys(target: unknown): string[] {
  if (typeof target !== "object" || target === null) return [];
  return Object.keys(target as Dict).filter((key) => key !== "transition");
}

/** Every `duration` found anywhere inside a value. */
function durations(value: unknown): number[] {
  if (typeof value !== "object" || value === null) return [];
  const found: number[] = [];
  for (const [key, inner] of Object.entries(value as Dict)) {
    if (key === "duration" && typeof inner === "number") found.push(inner);
    else found.push(...durations(inner));
  }
  return found;
}

describe("reduced motion", () => {
  it("card variants animate only opacity, in at most 0.15 s", () => {
    const variants = cardVariants(true);
    expect(variants).toBe(CARD_REDUCED_VARIANTS);
    for (const variant of Object.values(variants)) {
      expect(animatedKeys(variant)).toEqual(["opacity"]);
      const found = durations(variant);
      for (const duration of found) expect(duration).toBeLessThanOrEqual(0.15);
    }
    expect(CARD_REDUCED_VARIANTS).not.toHaveProperty("shudder");
  });

  it("tombstone, mound and counter animate only opacity, in at most 0.15 s", () => {
    const results = [
      tombstoneMotion(true),
      moundMotion(true, "left"),
      moundMotion(true, "right"),
      counterFade(true),
    ];
    for (const result of results) {
      expect(animatedKeys(result.initial === false ? {} : result.initial)).toEqual(
        result.initial === false ? [] : ["opacity"],
      );
      expect(animatedKeys(result.animate)).toEqual(["opacity"]);
      const found = durations(result.transition);
      expect(found.length).toBeGreaterThan(0);
      for (const duration of found) expect(duration).toBeLessThanOrEqual(0.15);
    }
  });

  it("fog fades opacity only, in at most 0.15 s", () => {
    const result = fogFade(true, true);
    expect(animatedKeys(result.animate)).toEqual(["opacity"]);
    expect(durations(result.transition)).toEqual([0.15]);
  });
});

describe("full motion", () => {
  it("uses the Spike's spring and tween values", () => {
    expect(CARD_RISE_SPRING).toMatchObject({ type: "spring", stiffness: 120, damping: 14 });
    expect(CARD_SETTLE_SPRING).toMatchObject({ type: "spring", stiffness: 90, damping: 18 });
    expect(SHUDDER).toEqual({ duration: 0.45, ease: "easeInOut" });
    expect(SINK).toEqual({ duration: 0.6, ease: SINK_EASE });
    expect(SINK_EASE).toEqual([0.55, 0, 1, 0.45]);
    expect(TOMBSTONE_RISE_SPRING).toMatchObject({ type: "spring", stiffness: 80, damping: 12 });
    expect(COUNTER_TWEEN.duration).toBe(0.8);
    expect(REDUCED_FADE).toEqual({ duration: 0.15 });
  });

  it("card variants use those values", () => {
    const variants = cardVariants(false);
    expect(variants).toBe(CARD_VARIANTS);
    expect(variants.risen).toMatchObject({ y: 0, transition: CARD_RISE_SPRING });
    expect(variants.settled).toMatchObject({ transition: CARD_SETTLE_SPRING });
    expect(variants.shudder).toMatchObject({ transition: SHUDDER });
    expect(variants.sunk).toMatchObject({ y: "115%", transition: SINK });
  });

  it("the tombstone rises on its spring", () => {
    const result = tombstoneMotion(false);
    expect(result.initial).toEqual({ y: "105%" });
    expect(result.animate).toEqual({ y: 0 });
    expect(result.transition).toBe(TOMBSTONE_RISE_SPRING);
  });

  it("the mound halves close from opposite sides in 0.55 s", () => {
    const left = moundMotion(false, "left");
    const right = moundMotion(false, "right");
    expect(left.initial).toMatchObject({ x: -96 });
    expect(right.initial).toMatchObject({ x: 96 });
    expect(left.transition).toMatchObject({ duration: 0.55, ease: "easeOut" });
  });

  it("the counter shows without an entrance and fog thins over 2.4 s", () => {
    expect(counterFade(false).initial).toBe(false);
    expect(fogFade(false, true).transition).toEqual({ duration: 2.4, ease: "easeOut" });
  });
});

describe("fog", () => {
  it("fades to 0.45 once cleared and to 1 otherwise", () => {
    expect(fogFade(true, true).animate).toEqual({ opacity: 0.45 });
    expect(fogFade(true, false).animate).toEqual({ opacity: 1 });
    expect(fogFade(false, true).animate).toEqual({ opacity: 0.45 });
    expect(fogFade(false, false).animate).toEqual({ opacity: 1 });
  });
});

describe("burial fallback", () => {
  it("is 2,000 ms", () => {
    expect(BURIAL_FALLBACK_MS).toBe(2000);
  });
});

describe("nothing flashes", () => {
  /** True when a value has `repeat` and animates colour or opacity. */
  function flashes(value: unknown): boolean {
    if (typeof value !== "object" || value === null) return false;
    const dict = value as Dict;
    if ("repeat" in dict) {
      const keys = Object.keys(dict).concat(Object.keys((dict.transition ?? {}) as Dict));
      if (keys.some((key) => /opacity|color|background|fill|stroke/i.test(key))) return true;
    }
    return Object.values(dict).some(flashes);
  }

  it("no exported value repeats a colour or opacity animation", () => {
    for (const [name, exported] of Object.entries(motionValues)) {
      if (typeof exported !== "function") expect(flashes(exported), name).toBe(false);
    }
    for (const reduced of [true, false]) {
      expect(flashes(cardVariants(reduced))).toBe(false);
      expect(flashes(tombstoneMotion(reduced))).toBe(false);
      expect(flashes(moundMotion(reduced, "left"))).toBe(false);
      expect(flashes(moundMotion(reduced, "right"))).toBe(false);
      expect(flashes(counterFade(reduced))).toBe(false);
      expect(flashes(fogFade(reduced, true))).toBe(false);
      expect(flashes(fogFade(reduced, false))).toBe(false);
    }
  });

  it("no exported value repeats at all", () => {
    expect(JSON.stringify(CARD_VARIANTS)).not.toContain("repeat");
    expect(JSON.stringify(CARD_REDUCED_VARIANTS)).not.toContain("repeat");
  });
});
